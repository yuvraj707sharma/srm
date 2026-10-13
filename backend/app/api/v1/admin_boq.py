import io
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, Request, Security, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.api.deps import get_current_user
from app.core.security import decode_access_token
from app.models.user import User
from app.models.boq import BOQ, BOQItem, BOQSubmission, BOQSubmissionItem, BOQVendorTarget
from app.models.vendor import VendorOrganization
from app.services.boq import (
    extract_content_from_file,
    extract_boq_with_gemini,
    get_comparative_statement_data,
    get_submission_detail_data,
    evaluate_submission_technical_compliance,
    export_comparative_statement_excel,
    export_comparative_statement_pdf,
    generate_boq_excel_template
)
from app.services.email import send_boq_invitation_email
from app.services.document import DocumentService
from app.services.storage.local import LocalStorageService

logger = logging.getLogger(__name__)

router = APIRouter()

def require_admin(user: User = Depends(get_current_user)):
    return user

security_optional = HTTPBearer(auto_error=False)

async def require_admin_or_token(
    request: Request,
    token: Optional[str] = Query(None),
    auth_header: Optional[HTTPAuthorizationCredentials] = Security(security_optional),
    db: AsyncSession = Depends(get_db)
) -> User:
    token_str = None
    if auth_header and auth_header.credentials:
        token_str = auth_header.credentials
    elif token:
        token_str = token
    elif "access_token" in request.cookies:
        token_str = request.cookies.get("access_token")
        
    if not token_str:
        raise HTTPException(status_code=401, detail="Authentication credentials required.")
        
    payload = decode_access_token(token_str)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
        
    user_id = payload.get("sub")
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive.")
    return user


# -------------------------------------------------------------------------
# Pydantic Schemas
# -------------------------------------------------------------------------

class ItemPayload(BaseModel):
    id: Optional[str] = None
    item_code: Optional[str] = None
    item_name: str
    specifications: Optional[str] = None
    quantity: float = 1.0
    uom: str = "Nos"
    category: Optional[str] = None
    target_price: Optional[float] = None
    attributes: Optional[Dict[str, Any]] = None

class BOQCreatePayload(BaseModel):
    title: str
    tender_number: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    boq_type: Optional[str] = "COMMERCIAL"  # TECHNICAL, COMMERCIAL, TECHNOCOMMERCIAL
    custom_columns: Optional[List[str]] = []
    items: List[ItemPayload]
    target_audience: Optional[str] = "ALL_APPROVED"  # ALL_APPROVED | SELECTED_VENDORS
    selected_vendor_ids: Optional[List[str]] = []
    deadline_days: Optional[int] = 3  # default 3-day time lock
    allow_download: Optional[bool] = True
    publish_now: Optional[bool] = False
    document_version_id: Optional[str] = None
    extracted_data: Optional[Dict[str, Any]] = None

class BOQUpdatePayload(BaseModel):
    title: str
    tender_number: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    boq_type: Optional[str] = "COMMERCIAL"
    custom_columns: Optional[List[str]] = []
    items: List[ItemPayload]

class PublishPayload(BaseModel):
    target_audience: str = "ALL_APPROVED"  # ALL_APPROVED | SELECTED_VENDORS
    selected_vendor_ids: Optional[List[str]] = []
    deadline_days: Optional[int] = 3
    deadline_at: Optional[datetime] = None
    allow_download: bool = True

class DeadlineUpdatePayload(BaseModel):
    deadline_at: datetime

class NegotiationPayload(BaseModel):
    submission_id: str
    negotiated_grand_total: Optional[float] = None
    items: Optional[List[Dict[str, Any]]] = []  # [{submission_item_id, negotiated_unit_price}]

class DisqualifyPayload(BaseModel):
    is_disqualified: bool
    note: Optional[str] = None

class ParseTextPayload(BaseModel):
    raw_text: str
    boq_type: Optional[str] = "COMMERCIAL"

class CompareChatPayload(BaseModel):
    message: str
    conversation_history: Optional[List[Dict[str, str]]] = []


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------

@router.post("/parse-text")
async def parse_boq_from_text(
    payload: ParseTextPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Parse arbitrary pasted or typed BOQ text (medical equipment specs, room schedules, line items)
    into structured items and custom columns using Gemini AI.
    """
    raw_text = payload.raw_text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Pasted BOQ text cannot be empty.")
    
    try:
        extracted_data = await extract_boq_with_gemini(raw_text, boq_type=payload.boq_type or "COMMERCIAL")
        return {
            "status": "success",
            "data": extracted_data
        }
    except Exception as e:
        logger.error(f"Error parsing pasted BOQ text: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse BOQ text: {str(e)}")


@router.post("/extract")
async def extract_boq_from_file(
    file: UploadFile = File(...),
    boq_type: str = Form("COMMERCIAL"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Upload any PDF or Excel BOQ tender file. Gemini AI analyzes table layout
    and returns normalized items and detected custom columns. Saves document into system storage.
    """
    try:
        content_bytes = await file.read()
        await file.seek(0)
        
        # 1. Save uploaded file to Document storage (safe fallback)
        doc_version_id = None
        try:
            doc_service = DocumentService(db, LocalStorageService())
            doc_version = await doc_service.upload_document(
                vendor_organization_id=None,
                document_type="BOQ_ADMIN_SOURCE",
                file=file,
                uploaded_by_user_id=admin.id
            )
            doc_version_id = doc_version.id
        except Exception as doc_err:
            logger.warning(f"Could not persist uploaded BOQ file to document storage: {doc_err}")
        
        # 2. Extract content text
        raw_text = extract_content_from_file(content_bytes, file.filename)
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract readable text from uploaded file.")
        
        # 3. Call AI with retry
        extracted_data = await extract_boq_with_gemini(raw_text, boq_type=boq_type)
        return {
            "status": "success",
            "filename": file.filename,
            "document_version_id": doc_version_id,
            "boq_type": boq_type,
            "data": extracted_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting BOQ from file {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")


@router.post("/quick-upload-publish")
async def quick_upload_and_publish(
    file: UploadFile = File(...),
    boq_type: str = Form("COMMERCIAL"),
    title: Optional[str] = Form(None),
    deadline_days: int = Form(7),
    target_audience: str = Form("ALL_APPROVED"),
    publish_now: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Formless BOQ Creation: Admin uploads document, Gemini AI extracts all items, 
    one-time charges, and commercial terms, stores everything, and immediately publishes.
    No manual form filling required!
    """
    try:
        content_bytes = await file.read()
        await file.seek(0)
        
        # 1. Save file
        doc_service = DocumentService(db, LocalStorageService())
        doc_version = await doc_service.upload_document(
            vendor_organization_id=None,
            document_type="BOQ_ADMIN_SOURCE",
            file=file,
            uploaded_by_user_id=admin.id
        )
        
        # 2. Extract content text
        raw_text = extract_content_from_file(content_bytes, file.filename)
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract readable text from uploaded file.")
            
        # 3. Gemini extraction
        extracted_data = await extract_boq_with_gemini(raw_text, boq_type=boq_type)
        
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(days=deadline_days) if publish_now and deadline_days else None
        
        boq_title = title or extracted_data.get("title") or file.filename.rsplit(".", 1)[0].replace("_", " ")
        tender_no = f"JECRC-{boq_type[:3].upper()}-{now.strftime('%Y%m%d%H%M')}"
        
        new_boq = BOQ(
            title=boq_title,
            tender_number=tender_no,
            department=extracted_data.get("department") or "Procurement",
            description=extracted_data.get("description") or f"Automated AI-ingested {boq_type} Tender from {file.filename}",
            status="PUBLISHED" if publish_now else "DRAFT",
            boq_type=boq_type,
            published_at=now if publish_now else None,
            deadline_at=deadline,
            target_audience=target_audience,
            allow_download=True,
            custom_columns_json=json.dumps(extracted_data.get("custom_columns") or []),
            extracted_data_json=json.dumps(extracted_data),
            document_version_id=doc_version.id
        )
        db.add(new_boq)
        await db.flush()
        
        # Add extracted items
        for item_data in extracted_data.get("items", []):
            boq_item = BOQItem(
                boq_id=new_boq.id,
                item_code=item_data.get("item_code"),
                item_name=item_data.get("item_name") or "Item",
                specifications=item_data.get("specifications"),
                quantity=float(item_data.get("quantity") or 1.0),
                uom=item_data.get("uom") or "Nos",
                category=item_data.get("category"),
                target_price=item_data.get("target_price"),
                attributes_json=json.dumps(item_data.get("attributes") or {})
            )
            db.add(boq_item)
            
        await db.commit()
        
        if publish_now:
            await _notify_vendors_for_boq(db, new_boq)
            
        return {
            "status": "success",
            "message": f"BOQ successfully created and {'published' if publish_now else 'saved as draft'}.",
            "boq_id": new_boq.id,
            "title": new_boq.title,
            "items_count": len(extracted_data.get("items", [])),
            "boq_type": boq_type
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quick upload & publish failed for {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process BOQ: {str(e)}")


@router.post("/upload-document")
async def upload_boq_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Direct document upload (PDF, Excel, Word DOC/DOCX) for vendors to download.
    Does NOT require AI extraction.
    """
    try:
        doc_service = DocumentService(db, LocalStorageService())
        doc_version = await doc_service.upload_document(
            vendor_organization_id=None,
            document_type="BOQ_ADMIN_SOURCE",
            file=file,
            uploaded_by_user_id=admin.id
        )
        return {
            "status": "success",
            "filename": file.filename,
            "document_version_id": doc_version.id
        }
    except Exception as e:
        logger.error(f"Error uploading BOQ document {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")



@router.get("")
async def list_boqs(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    List all BOQs with status, submission counts, and time remaining until deadline lock.
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions),
            selectinload(BOQ.targets)
        )
        .order_by(BOQ.created_at.desc())
    )
    res = await db.execute(stmt)
    boqs = res.scalars().all()

    now = datetime.now(timezone.utc)
    results = []
    for b in boqs:
        # Check deadline lock
        is_deadline_passed = False
        remaining_seconds = 0
        if b.deadline_at:
            # Ensure timezone-aware comparison
            deadline = b.deadline_at if b.deadline_at.tzinfo else b.deadline_at.replace(tzinfo=timezone.utc)
            if now > deadline:
                is_deadline_passed = True
            else:
                remaining_seconds = int((deadline - now).total_seconds())

        submitted_count = sum(1 for s in b.submissions if s.status == "SUBMITTED")

        results.append({
            "id": b.id,
            "tender_number": b.tender_number or f"JECRC-BOQ-{b.id[:8].upper()}",
            "title": b.title,
            "department": b.department,
            "description": b.description,
            "boq_type": getattr(b, "boq_type", "COMMERCIAL") or "COMMERCIAL",
            "status": "LOCKED" if (b.status == "PUBLISHED" and is_deadline_passed) else b.status,
            "published_at": b.published_at.isoformat() if b.published_at else None,
            "deadline_at": b.deadline_at.isoformat() if b.deadline_at else None,
            "is_deadline_passed": is_deadline_passed,
            "remaining_seconds": max(0, remaining_seconds),
            "target_audience": b.target_audience,
            "allow_download": b.allow_download,
            "total_items": len(b.items),
            "total_submissions": submitted_count,
            "created_at": b.created_at.isoformat() if b.created_at else None
        })

    return results


@router.post("")
async def create_boq(
    payload: BOQCreatePayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Create a new BOQ draft or directly publish with deadline and targeted vendors.
    """
    now = datetime.now(timezone.utc)
    deadline = None
    if payload.publish_now and payload.deadline_days:
        deadline = now + timedelta(days=payload.deadline_days)

    new_boq = BOQ(
        title=payload.title,
        tender_number=payload.tender_number,
        department=payload.department,
        description=payload.description,
        status="PUBLISHED" if payload.publish_now else "DRAFT",
        boq_type=payload.boq_type or "COMMERCIAL",
        published_at=now if payload.publish_now else None,
        deadline_at=deadline,
        target_audience=payload.target_audience or "ALL_APPROVED",
        allow_download=payload.allow_download if payload.allow_download is not None else True,
        custom_columns_json=json.dumps(payload.custom_columns) if payload.custom_columns else "[]",
        extracted_data_json=json.dumps(payload.extracted_data) if payload.extracted_data else None,
        document_version_id=payload.document_version_id
    )
    db.add(new_boq)
    await db.flush()

    # Add items
    for item_data in payload.items:
        boq_item = BOQItem(
            boq_id=new_boq.id,
            item_code=item_data.item_code,
            item_name=item_data.item_name,
            specifications=item_data.specifications,
            quantity=item_data.quantity,
            uom=item_data.uom or "Nos",
            category=item_data.category,
            target_price=item_data.target_price,
            attributes_json=json.dumps(item_data.attributes) if item_data.attributes else "{}"
        )
        db.add(boq_item)

    # If targets specified
    if payload.target_audience == "SELECTED_VENDORS" and payload.selected_vendor_ids:
        for v_id in payload.selected_vendor_ids:
            target = BOQVendorTarget(boq_id=new_boq.id, vendor_organization_id=v_id)
            db.add(target)

    await db.commit()

    # If published immediately, notify vendors
    if payload.publish_now:
        await _notify_vendors_for_boq(db, new_boq)

    return {"status": "success", "boq_id": new_boq.id}


@router.put("/{boq_id}")
async def update_boq(
    boq_id: str,
    payload: BOQUpdatePayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    boq.title = payload.title
    boq.tender_number = payload.tender_number
    boq.department = payload.department
    boq.description = payload.description
    boq.boq_type = payload.boq_type or "COMMERCIAL"
    boq.custom_columns_json = json.dumps(payload.custom_columns) if payload.custom_columns else "[]"

    # Upsert items
    existing_items_map = {it.id: it for it in boq.items}
    incoming_item_ids = set()

    for item_data in payload.items:
        if item_data.id and item_data.id in existing_items_map:
            # Update existing
            it = existing_items_map[item_data.id]
            it.item_code = item_data.item_code
            it.item_name = item_data.item_name
            it.specifications = item_data.specifications
            it.quantity = item_data.quantity
            it.uom = item_data.uom or "Nos"
            it.category = item_data.category
            it.target_price = item_data.target_price
            it.attributes_json = json.dumps(item_data.attributes) if item_data.attributes else "{}"
            incoming_item_ids.add(it.id)
        else:
            # Add new
            new_item = BOQItem(
                boq_id=boq.id,
                item_code=item_data.item_code,
                item_name=item_data.item_name,
                specifications=item_data.specifications,
                quantity=item_data.quantity,
                uom=item_data.uom or "Nos",
                category=item_data.category,
                target_price=item_data.target_price,
                attributes_json=json.dumps(item_data.attributes) if item_data.attributes else "{}"
            )
            db.add(new_item)

    # Delete missing items
    for existing_id, existing_item in existing_items_map.items():
        if existing_id not in incoming_item_ids:
            await db.delete(existing_item)

    await db.commit()
    return {"status": "success", "boq_id": boq.id}


@router.get("/{boq_id}")
async def get_boq_detail(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.targets).selectinload(BOQVendorTarget.vendor_organization),
            selectinload(BOQ.submissions).selectinload(BOQSubmission.vendor_organization)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    custom_cols = []
    if boq.custom_columns_json:
        try:
            custom_cols = json.loads(boq.custom_columns_json)
        except Exception:
            custom_cols = []

    now = datetime.now(timezone.utc)
    is_locked = False
    remaining_seconds = 0
    if boq.deadline_at:
        deadline = boq.deadline_at if boq.deadline_at.tzinfo else boq.deadline_at.replace(tzinfo=timezone.utc)
        if now > deadline:
            is_locked = True
        else:
            remaining_seconds = int((deadline - now).total_seconds())

    return {
        "id": boq.id,
        "tender_number": boq.tender_number or f"JECRC-BOQ-{boq.id[:8].upper()}",
        "title": boq.title,
        "department": boq.department,
        "description": boq.description,
        "boq_type": getattr(boq, "boq_type", "COMMERCIAL") or "COMMERCIAL",
        "document_version_id": boq.document_version_id,
        "extracted_data": json.loads(boq.extracted_data_json) if getattr(boq, "extracted_data_json", None) else None,
        "status": "LOCKED" if (boq.status == "PUBLISHED" and is_locked) else boq.status,
        "published_at": boq.published_at.isoformat() if boq.published_at else None,
        "deadline_at": boq.deadline_at.isoformat() if boq.deadline_at else None,
        "is_deadline_passed": is_locked,
        "remaining_seconds": max(0, remaining_seconds),
        "target_audience": boq.target_audience,
        "allow_download": boq.allow_download,
        "custom_columns": custom_cols,
        "items": [
            {
                "id": i.id,
                "item_code": i.item_code,
                "item_name": i.item_name,
                "specifications": i.specifications,
                "quantity": i.quantity,
                "uom": i.uom,
                "category": i.category,
                "target_price": i.target_price,
                "attributes": json.loads(i.attributes_json) if i.attributes_json else {}
            }
            for i in boq.items
        ],
        "targeted_vendors": [
            {
                "id": t.vendor_organization.id,
                "legal_name": t.vendor_organization.legal_name,
                "status": t.vendor_organization.status
            }
            for t in boq.targets if t.vendor_organization
        ],
        "submissions_count": sum(1 for s in boq.submissions if s.status == "SUBMITTED"),
        "submissions": [
            {
                "id": s.id,
                "vendor_organization_id": s.vendor_organization_id,
                "vendor_name": s.vendor_organization.legal_name if s.vendor_organization else "Unknown Vendor",
                "vendor_email": (s.vendor_organization.primary_email or s.vendor_organization.alternate_email) if s.vendor_organization else None,
                "status": s.status,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "grand_total": s.grand_total,
                "submission_type": s.submission_type,
                "model_no": getattr(s, "model_no", None),
                "tank_capacity_location": getattr(s, "tank_capacity_location", None),
                "document_version_id": s.document_version_id,
                "extracted_data": json.loads(s.extracted_data_json) if getattr(s, "extracted_data_json", None) else None
            }
            for s in boq.submissions
        ]
    }


@router.get("/{boq_id}/download-template")
async def download_admin_boq_template(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Download pre-formatted blank BOQ Excel template for admin review.
    """
    stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    stream = generate_boq_excel_template(boq)
    filename = f"BOQ_Template_{boq.tender_number or boq.id[:8]}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/{boq_id}/publish")
async def publish_boq(
    boq_id: str,
    payload: PublishPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Publish a BOQ with deadline countdown and email notification to targeted vendors.
    """
    stmt = (
        select(BOQ)
        .options(selectinload(BOQ.targets))
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    now = datetime.now(timezone.utc)
    if payload.deadline_at:
        deadline = payload.deadline_at
    else:
        days = payload.deadline_days if payload.deadline_days else 3
        deadline = now + timedelta(days=days)

    boq.status = "PUBLISHED"
    boq.published_at = now
    boq.deadline_at = deadline
    boq.target_audience = payload.target_audience
    boq.allow_download = payload.allow_download

    # Update targets if selected
    if payload.target_audience == "SELECTED_VENDORS" and payload.selected_vendor_ids:
        # Clear previous targets
        for t in boq.targets:
            await db.delete(t)
        for v_id in payload.selected_vendor_ids:
            new_target = BOQVendorTarget(boq_id=boq.id, vendor_organization_id=v_id)
            db.add(new_target)

    await db.commit()

    # Dispatch email notifications
    await _notify_vendors_for_boq(db, boq)

    return {
        "status": "success",
        "message": "BOQ published successfully and notification emails dispatched.",
        "deadline_at": deadline.isoformat()
    }


@router.patch("/{boq_id}/deadline")
async def update_boq_deadline(
    boq_id: str,
    payload: DeadlineUpdatePayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    stmt = select(BOQ).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    boq.deadline_at = payload.deadline_at
    # If it was locked, unlock to PUBLISHED if deadline is in the future
    if payload.deadline_at > datetime.now(timezone.utc) and boq.status == "LOCKED":
        boq.status = "PUBLISHED"

    await db.commit()
    return {"status": "success", "deadline_at": boq.deadline_at.isoformat()}


@router.post("/{boq_id}/close")
async def close_boq(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Manually close tender submissions early before deadline. Sets status to LOCKED and deadline to now.
    """
    stmt = select(BOQ).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")
        
    now = datetime.now(timezone.utc)
    boq.status = "LOCKED"
    boq.deadline_at = now
    await db.commit()
    return {
        "status": "success",
        "message": "BOQ closed successfully. Tender submissions are now locked for comparison.",
        "status_code": "LOCKED",
        "closed_at": now.isoformat()
    }


@router.get("/{boq_id}/comparative-statement")
async def get_comparative_statement(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Returns full side-by-side comparative statement matrix matching Format_Comparative Statement.xlsx
    including L1/T1 badges, negotiated prices, and item-level lowest bids.
    """
    try:
        data = await get_comparative_statement_data(db, boq_id)
        return data
    except Exception as e:
        logger.error(f"Error compiling comparative statement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{boq_id}/negotiate")
async def update_negotiation(
    boq_id: str,
    payload: NegotiationPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Admin updates negotiated rates for a vendor's bid. Recalculates totals.
    """
    stmt = (
        select(BOQSubmission)
        .options(selectinload(BOQSubmission.items).selectinload(BOQSubmissionItem.boq_item))
        .where(BOQSubmission.id == payload.submission_id)
    )
    res = await db.execute(stmt)
    submission = res.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Vendor submission not found")

    # Update item-level negotiated rates
    if payload.items:
        item_map = {item.id: item for item in submission.items}
        for it in payload.items:
            sub_item_id = it.get("submission_item_id")
            neg_price = it.get("negotiated_unit_price")
            if sub_item_id in item_map and neg_price is not None:
                sub_item = item_map[sub_item_id]
                sub_item.negotiated_unit_price = float(neg_price)
                sub_item.negotiated_total_amount = float(neg_price) * sub_item.boq_item.quantity

        # Recalculate negotiated grand total from items
        neg_sub_total = sum(
            (item.negotiated_total_amount if item.negotiated_total_amount is not None else item.total_amount)
            for item in submission.items
        )
        neg_gst = neg_sub_total * (submission.gst_percent / 100.0)
        submission.negotiated_grand_total = neg_sub_total + neg_gst
    elif payload.negotiated_grand_total is not None:
        submission.negotiated_grand_total = payload.negotiated_grand_total

    await db.commit()
    return {"status": "success", "negotiated_grand_total": submission.negotiated_grand_total}


@router.get("/{boq_id}/submissions/{submission_id}")
async def get_vendor_submission_detail(
    boq_id: str,
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    Fetches full standalone vendor submission details, item quotes, and spec audit.
    """
    try:
        data = await get_submission_detail_data(db, boq_id, submission_id)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{boq_id}/run-ai-audit")
async def run_ai_technical_audit(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Executes or re-runs deep AI specification compliance audit on all vendor submissions for this BOQ.
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions).selectinload(BOQSubmission.items)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    audited = 0
    for sub in boq.submissions:
        if sub.status == "SUBMITTED" or sub.submitted_at is not None:
            await evaluate_submission_technical_compliance(boq, sub, db=db)
            audited += 1

    return {"status": "success", "message": f"Successfully audited {audited} vendor submission(s)."}


@router.get("/{boq_id}/export-excel")
async def export_comparative_excel(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    Exports formatted comparative statement Excel spreadsheet matching Format_Comparative Statement.xlsx.
    """
    data = await get_comparative_statement_data(db, boq_id)
    excel_stream = export_comparative_statement_excel(data)
    
    filename = f"Comparative_Statement_{data.get('tender_number', 'BOQ')}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/{boq_id}/export-pdf")
async def export_comparative_pdf(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    Exports a professional PDF comparative statement using ReportLab.
    A3 Landscape with vendor summary, price matrix, disqualification notes and signature block.
    """
    data = await get_comparative_statement_data(db, boq_id)
    pdf_stream = export_comparative_statement_pdf(data)

    filename = f"Comparative_Statement_{data.get('tender_number', 'BOQ')}.pdf"
    return StreamingResponse(
        pdf_stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/{boq_id}/compare/chat")
async def chat_comparative_statement(
    boq_id: str,
    payload: CompareChatPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    AI Tender Evaluation Analyst: Answers procurement questions, generates comparisons,
    analyzes commercial terms, and identifies negotiation opportunities from the comparative statement matrix.
    """
    try:
        data = await get_comparative_statement_data(db, boq_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Comparative statement error: {str(e)}")

    tender_title = data.get("title", "Tender")
    tender_no = data.get("tender_number", "Ref N/A")
    vendors = data.get("vendors", [])
    rows = data.get("rows", [])
    l1 = data.get("l1_profile")

    # Build text representation of comparative matrix
    context_lines = [
        f"TENDER: {tender_title} ({tender_no})",
        f"TOTAL VENDORS PARTICIPATING: {len(vendors)}",
    ]
    if l1:
        context_lines.append(f"CURRENT L1 BIDDER: {l1.get('vendor_name')} (Grand Total: INR {l1.get('effective_total', 0):,.2f})")

    context_lines.append("\nVENDOR DETAILS & COMMERCIAL TOTALS:")
    for v in vendors:
        v_name = v.get("vendor_name") or v.get("company_name")
        context_lines.append(
            f"- Vendor: {v_name} | Rank: {v.get('l_rank', '-')} | Grand Total: INR {v.get('effective_total', 0):,.2f} "
            f"| GST: INR {v.get('gst_amount', 0):,.2f} | Contact: {v.get('contact_no', '-')} | Model: {v.get('model_no', '-')} | Tank/Location: {v.get('tank_capacity_location', '-')}"
        )
        context_lines.append(
            f"  Terms: SITC Payment: {v.get('payment_terms_sitc', '-')}, Gas Payment: {v.get('payment_terms_gas', '-')}, "
            f"Delivery: {v.get('delivery_time', '-')}, Tenure: {v.get('agreement_tenure', '-')}, Lock-in: {v.get('lock_in_period', '-')}, "
            f"Price Escalation: {v.get('price_escalation', '-')}, Mode of Delivery: {v.get('mode_of_delivery', '-')}, Min Volume: {v.get('minimum_expected_volume', '-')}"
        )

    context_lines.append("\nITEMIZED LINE ITEM COMPARISON:")
    for r in rows:
        context_lines.append(f"\nItem {r.get('s_no')}: {r.get('item_name')} (Qty: {r.get('quantity')} {r.get('uom')})")
        for v in vendors:
            sub_id = v.get("submission_id")
            q = r.get("vendor_quotes", {}).get(sub_id, {})
            v_name = v.get("vendor_name")
            unit_p = q.get("negotiated_price") or q.get("initial_quoted_price") or 0.0
            tot_p = q.get("negotiated_total_amount") or q.get("total_amount") or 0.0
            context_lines.append(f"  * {v_name}: Unit Rate: INR {unit_p:,.2f} | Total: INR {tot_p:,.2f}")

    matrix_context = "\n".join(context_lines)

    system_prompt = f"""You are an elite Procurement Advisor, Chief Financial Officer (CFO), and Healthcare Quantity Surveyor advising the Procurement Committee at JECRC Medical College & Hospital.
You have the complete official Comparative Statement for this tender:

{matrix_context}

INSTRUCTIONS:
1. Provide accurate, data-driven, executive answers based ONLY on the above comparative statement data.
2. When comparing vendors, cite exact numbers (unit rates, totals, difference in INR, percentage difference).
3. Identify financial advantages, operational risks, hidden costs, and negotiation leverage.
4. Format your response cleanly using GitHub Markdown with bold headings, bullet points, and clean comparison tables where appropriate.
5. Be concise, objective, and professional.
"""

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return {"response": f"Summary for {tender_title}:\n\nTotal {len(vendors)} vendor(s) quoted. L1 bidder is {l1.get('vendor_name') if l1 else 'undetermined'} with total of INR {l1.get('effective_total', 0):,.2f}."}

    client = genai.Client(api_key=api_key)
    chat_prompt = f"User Question: {payload.message}\n\nPlease analyze the comparative statement and provide a comprehensive, clear response."

    models = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.0-flash", "gemini-flash"]
    answer = None
    for model_name in models:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=[chat_prompt],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                )
            )
            answer = resp.text.strip()
            if answer:
                break
        except Exception as err:
            logger.warning(f"Chat AI error with {model_name}: {err}")
            continue

    if not answer:
        answer = f"**Tender Summary:**\n- **Tender:** {tender_title}\n- **Vendors:** {len(vendors)} participating\n- **Lowest Bidder (L1):** {l1.get('vendor_name', 'N/A')} at INR {l1.get('effective_total', 0):,.2f}."

    return {
        "status": "success",
        "response": answer
    }


@router.get("/{boq_id}/download-template")
async def download_boq_template(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    Download Excel bidding template for this tender.
    """
    stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")

    stream = generate_boq_excel_template(boq)
    filename = f"BOQ_Template_{boq.tender_number or boq.id[:8]}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/{boq_id}/simulate-dummy-bids")
async def simulate_dummy_bids(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_token)
):
    """
    Rapid Testing Utility:
    Instantly generates and submits 3 realistic vendor bids (Inox Air Products, Linde India, Wilson Gases)
    for this BOQ so administrators can test the Comparative Statement without manual multi-account entry.
    """
    try:
        stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
        res = await db.execute(stmt)
        boq = res.scalar_one_or_none()
        if not boq:
            raise HTTPException(status_code=404, detail="BOQ not found")

        # If BOQ has no line items, populate standard LMO items so comparative statement works
        if not boq.items:
            default_items = [
                BOQItem(boq_id=boq.id, item_code="ITEM-001", item_name="Basic Price for LMO (Monthly)", quantity=13000.0, uom="SM3", target_price=11.80),
                BOQItem(boq_id=boq.id, item_code="ITEM-002", item_name="Delivery/Transportation Charges (Monthly)", quantity=13000.0, uom="SM3", target_price=2.89),
                BOQItem(boq_id=boq.id, item_code="ITEM-003", item_name="Fixed Facility Charges", quantity=12.0, uom="Monthly", target_price=15000.0),
                BOQItem(boq_id=boq.id, item_code="ITEM-004", item_name="One time Asset Installation & Commissioning Charges (SITC)", quantity=1.0, uom="Nos", target_price=150000.0),
                BOQItem(boq_id=boq.id, item_code="ITEM-005", item_name="PESO License work Fee (Govt.) for 5 years", quantity=1.0, uom="One time", target_price=200000.0),
            ]
            for it in default_items:
                db.add(it)
            await db.flush()
            # Refresh boq items
            stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
            res = await db.execute(stmt)
            boq = res.scalar_one_or_none()

        dummy_vendors = [
            {
                "name": "Inox Air Products Pvt Ltd",
                "contact": "Akash (+91 9999596836)",
                "model": "13 KL + 06 KL (BHIWADI)",
                "tank": "13 KL + 06 KL (BHIWADI)",
                "rate_multiplier": 0.95,
                "payment_terms": "100% Advance",
                "delivery_time": "8 Weeks to 10 Weeks",
                "tenure": "10 Years",
                "lock_in": "10 Years",
                "civil_work": "Hospital Scope",
                "price_esc": "Fixed for 2 years, 5% Y on Y Or Formula Based, whichever is lesser",
                "mode_delivery": "Weighment Basis",
                "min_volume": "will review after 2 years 6 months",
            },
            {
                "name": "Linde India Ltd",
                "contact": "Hardeep Singh (+91 9878219520)",
                "model": "20 KL, LUDHIANA (400km)",
                "tank": "20 KL, LUDHIANA (400km)",
                "rate_multiplier": 1.05,
                "payment_terms": "100% After Completion",
                "delivery_time": "8 to 12 Weeks",
                "tenure": "5 Years",
                "lock_in": "5 Years",
                "civil_work": "Hospital Scope",
                "price_esc": "6% Y on Y Or Formula Based, whichever is lesser",
                "mode_delivery": "Weighment Basis",
                "min_volume": "40000M3",
            },
            {
                "name": "Wilson Gases & Healthcare",
                "contact": "Utkarsh (+91 8385058000)",
                "model": "13KL + 06 KL (Jaipur)",
                "tank": "13KL + 06 KL (Jaipur)",
                "rate_multiplier": 1.12,
                "payment_terms": "100% Advance",
                "delivery_time": "8 Weeks to 10 Weeks",
                "tenure": "7 Years",
                "lock_in": "5 Years",
                "civil_work": "Hospital Scope",
                "price_esc": "NIL",
                "mode_delivery": "Weighment Basis",
                "min_volume": "12000M3",
            },
        ]

        created_submissions = []

        for vdata in dummy_vendors:
            # Find or create vendor org
            stmt_org = select(VendorOrganization).where(VendorOrganization.legal_name == vdata["name"])
            res_org = await db.execute(stmt_org)
            org = res_org.scalars().first()
            if not org:
                org = VendorOrganization(
                    legal_name=vdata["name"],
                    trade_name=vdata["name"],
                    organization_type="Private Limited",
                    country="India",
                    status="APPROVED",
                    verification_status="VERIFIED"
                )
                db.add(org)
                await db.flush()

            # Check if submission already exists
            stmt_sub = select(BOQSubmission).options(selectinload(BOQSubmission.items)).where(
                BOQSubmission.boq_id == boq_id,
                BOQSubmission.vendor_organization_id == org.id
            )
            res_sub = await db.execute(stmt_sub)
            sub = res_sub.scalar_one_or_none()
            
            if not sub:
                sub = BOQSubmission(
                    boq_id=boq_id,
                    vendor_organization_id=org.id,
                    status="SUBMITTED",
                    submission_type="MANUAL",
                    submitted_at=datetime.now(timezone.utc),
                    payment_terms=vdata["payment_terms"],
                    delivery_time=vdata["delivery_time"],
                    model_no=vdata["model"],
                    tank_capacity_location=vdata["tank"],
                )
                db.add(sub)
                await db.flush()
            else:
                sub.status = "SUBMITTED"
                sub.submitted_at = datetime.now(timezone.utc)
                sub.payment_terms = vdata["payment_terms"]
                sub.delivery_time = vdata["delivery_time"]
                sub.model_no = vdata["model"]
                sub.tank_capacity_location = vdata["tank"]

            # Populate submission items
            existing_items_map = {item.boq_item_id: item for item in sub.items} if sub.items else {}
            sub_total = 0.0
            total_gst = 0.0

            for idx, boq_item in enumerate(boq.items, start=1):
                base_rate = boq_item.target_price or (12.0 * idx if (boq_item.quantity or 1.0) > 100 else 15000.0)
                unit_price = round(base_rate * vdata["rate_multiplier"], 2)
                item_name_str = (boq_item.item_name or "").lower()
                gst_pct = 5.0 if ("gas" in item_name_str or "lmo" in item_name_str or "transport" in item_name_str) else 18.0
                qty = float(boq_item.quantity or 1.0)
                line_tot = round(unit_price * qty, 2)
                line_gst = round(line_tot * (gst_pct / 100.0), 2)

                sub_total += line_tot
                total_gst += line_gst

                if boq_item.id in existing_items_map:
                    s_item = existing_items_map[boq_item.id]
                    s_item.quoted_unit_price = unit_price
                    s_item.total_amount = line_tot
                    s_item.gst_percent = gst_pct
                    s_item.gst_amount = line_gst
                    s_item.technical_compliance = "COMPLIANT"
                else:
                    s_item = BOQSubmissionItem(
                        submission_id=sub.id,
                        boq_item_id=boq_item.id,
                        quoted_unit_price=unit_price,
                        total_amount=line_tot,
                        gst_percent=gst_pct,
                        gst_amount=line_gst,
                        technical_compliance="COMPLIANT"
                    )
                    db.add(s_item)

            sub.sub_total = sub_total
            sub.gst_amount = total_gst
            sub.grand_total = sub_total + total_gst
            created_submissions.append(vdata["name"])

        await db.commit()

        return {
            "status": "success",
            "message": f"Successfully simulated 3 vendor bids: {', '.join(created_submissions)}",
            "vendors": created_submissions
        }
    except Exception as e:
        logger.error(f"Error simulating dummy bids: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to simulate bids: {str(e)}")


# -------------------------------------------------------------------------
# Helper Functions
# -------------------------------------------------------------------------

async def _notify_vendors_for_boq(db: AsyncSession, boq: BOQ):
    """
    Sends email notifications to all targeted vendors.
    """
    vendors_to_notify = []
    if boq.target_audience == "ALL_APPROVED":
        stmt = select(VendorOrganization).where(VendorOrganization.status == "APPROVED")
        res = await db.execute(stmt)
        vendors_to_notify = res.scalars().all()
    else:
        # Targeted vendors
        stmt = (
            select(VendorOrganization)
            .join(BOQVendorTarget, BOQVendorTarget.vendor_organization_id == VendorOrganization.id)
            .where(BOQVendorTarget.boq_id == boq.id)
        )
        res = await db.execute(stmt)
        vendors_to_notify = res.scalars().all()

    deadline_str = boq.deadline_at.strftime("%d %B %Y, %I:%M %p UTC") if boq.deadline_at else "3 Days Time Lock"

    for vendor in vendors_to_notify:
        target_email = vendor.primary_email or vendor.head_email
        if target_email:
            try:
                send_boq_invitation_email(
                    to_email=target_email,
                    vendor_name=vendor.legal_name,
                    tender_number=boq.tender_number or f"JECRC-BOQ-{boq.id[:8].upper()}",
                    tender_title=boq.title,
                    department=boq.department,
                    deadline_str=deadline_str,
                    boq_id=boq.id
                )
            except Exception as e:
                logger.warning(f"Could not send email to vendor {vendor.legal_name} ({target_email}): {e}")

@router.delete("/{boq_id}")
async def delete_boq(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a BOQ and all its associated items, submissions, and vendor targets."""
    stmt = select(BOQ).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found.")
        
    await db.delete(boq)
    await db.commit()
    return {"status": "success", "message": "BOQ deleted successfully."}

@router.delete("/{boq_id}/submissions/{submission_id}")
async def delete_boq_submission(
    boq_id: str,
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a specific vendor submission on a BOQ."""
    from app.models.boq import BOQSubmission
    
    stmt = select(BOQSubmission).where(
        BOQSubmission.id == submission_id,
        BOQSubmission.boq_id == boq_id
    )
    res = await db.execute(stmt)
    submission = res.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
        
    await db.delete(submission)
    await db.commit()
    
    return {"status": "success", "message": "Vendor submission deleted successfully."}


@router.patch("/{boq_id}/submissions/{submission_id}/disqualify")
async def disqualify_submission(
    boq_id: str,
    submission_id: str,
    payload: DisqualifyPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Mark a vendor submission as disqualified (or reinstate it).
    Stores the reason note alongside the flag.
    """
    stmt = select(BOQSubmission).where(
        BOQSubmission.id == submission_id,
        BOQSubmission.boq_id == boq_id
    )
    res = await db.execute(stmt)
    submission = res.scalar_one_or_none()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")

    submission.is_disqualified = payload.is_disqualified
    submission.disqualification_note = payload.note if payload.is_disqualified else None
    await db.commit()

    return {
        "status": "success",
        "submission_id": submission_id,
        "is_disqualified": submission.is_disqualified,
        "disqualification_note": submission.disqualification_note,
    }
