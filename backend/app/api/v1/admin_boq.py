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
    custom_columns: Optional[List[str]] = []
    items: List[ItemPayload]
    target_audience: Optional[str] = "ALL_APPROVED"  # ALL_APPROVED | SELECTED_VENDORS
    selected_vendor_ids: Optional[List[str]] = []
    deadline_days: Optional[int] = 3  # default 3-day time lock
    allow_download: Optional[bool] = True
    publish_now: Optional[bool] = False
    document_version_id: Optional[str] = None

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


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------

@router.post("/extract")
async def extract_boq_from_file(
    file: UploadFile = File(...),
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
        
        # 1. Save uploaded file to Document storage
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
        
        # 3. Call AI with retry
        extracted_data = await extract_boq_with_gemini(raw_text)
        return {
            "status": "success",
            "filename": file.filename,
            "document_version_id": doc_version.id,
            "data": extracted_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting BOQ from file {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")


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
        published_at=now if payload.publish_now else None,
        deadline_at=deadline,
        target_audience=payload.target_audience or "ALL_APPROVED",
        allow_download=payload.allow_download if payload.allow_download is not None else True,
        custom_columns_json=json.dumps(payload.custom_columns) if payload.custom_columns else "[]",
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
                "submission_type": s.submission_type
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
