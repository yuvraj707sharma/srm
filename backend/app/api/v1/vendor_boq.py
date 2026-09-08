import io
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.boq import BOQ, BOQItem, BOQSubmission, BOQSubmissionItem, BOQVendorTarget
from app.models.vendor import VendorOrganization
from app.models.document import DocumentVersion
from app.services.storage.local import LocalStorageService
from app.services.document import DocumentService
from app.services.boq import (
    generate_boq_excel_template,
    parse_vendor_submission_file
)

logger = logging.getLogger(__name__)

router = APIRouter()

def get_vendor_org_id(user: User = Depends(get_current_user)) -> str:
    if not user.vendor_organization_id:
        raise HTTPException(
            status_code=403, 
            detail="Your account is not associated with an active vendor organization."
        )
    return user.vendor_organization_id


# -------------------------------------------------------------------------
# Pydantic Schemas
# -------------------------------------------------------------------------

class BidItemPayload(BaseModel):
    boq_item_id: str
    quoted_unit_price: float
    make_model_quoted: Optional[str] = None
    technical_compliance: Optional[str] = "COMPLIANT"
    vendor_remarks: Optional[str] = None
    gst_percent: Optional[float] = 18.0

class BidSubmissionPayload(BaseModel):
    items: List[BidItemPayload]
    gst_percent: Optional[float] = 18.0
    payment_terms: Optional[str] = None
    delivery_time: Optional[str] = None
    warranty_terms: Optional[str] = None


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------

@router.get("")
async def list_available_tenders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    List published tenders available to this vendor (targeted or open to all approved),
    with live deadline countdown and submission status.
    """
    # Fetch vendor organization to verify status
    res = await db.execute(select(VendorOrganization).where(VendorOrganization.id == vendor_org_id))
    vendor_org = res.scalar_one_or_none()
    if not vendor_org or vendor_org.status != "APPROVED":
        return []

    # Select BOQs that are published and either targeted to all approved or specifically to this vendor
    stmt = (
        select(BOQ)
        .outerjoin(BOQVendorTarget, BOQVendorTarget.boq_id == BOQ.id)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions)
        )
        .where(
            BOQ.status.in_(["PUBLISHED", "LOCKED", "EVALUATED"]),
            or_(
                BOQ.target_audience == "ALL_APPROVED",
                BOQVendorTarget.vendor_organization_id == vendor_org_id
            )
        )
        .distinct()
        .order_by(BOQ.published_at.desc())
    )
    res = await db.execute(stmt)
    boqs = res.scalars().all()

    now = datetime.now(timezone.utc)
    results = []
    for b in boqs:
        is_deadline_passed = False
        remaining_seconds = 0
        if b.deadline_at:
            deadline = b.deadline_at if b.deadline_at.tzinfo else b.deadline_at.replace(tzinfo=timezone.utc)
            if now > deadline:
                is_deadline_passed = True
            else:
                remaining_seconds = int((deadline - now).total_seconds())

        # Check vendor's submission
        sub = next((s for s in b.submissions if s.vendor_organization_id == vendor_org_id), None)
        sub_status = "NOT_SUBMITTED"
        submitted_at = None
        grand_total = 0.0
        if sub and sub.status == "SUBMITTED":
            sub_status = "SUBMITTED"
            submitted_at = sub.submitted_at.isoformat() if sub.submitted_at else None
            grand_total = sub.grand_total

        results.append({
            "id": b.id,
            "tender_number": b.tender_number or f"JECRC-BOQ-{b.id[:8].upper()}",
            "title": b.title,
            "department": b.department,
            "description": b.description,
            "boq_type": getattr(b, "boq_type", "COMMERCIAL") or "COMMERCIAL",
            "status": "LOCKED" if is_deadline_passed else b.status,
            "published_at": b.published_at.isoformat() if b.published_at else None,
            "deadline_at": b.deadline_at.isoformat() if b.deadline_at else None,
            "is_deadline_passed": is_deadline_passed,
            "remaining_seconds": max(0, remaining_seconds),
            "allow_download": b.allow_download,
            "total_items": len(b.items),
            "submission_status": sub_status,
            "submitted_at": submitted_at,
            "grand_total": grand_total
        })

    return results


@router.get("/{boq_id}")
async def get_tender_detail(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Get detailed tender specification, items, custom columns, and existing submission (if any).
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions)
            .selectinload(BOQSubmission.items)
            .selectinload(BOQSubmissionItem.boq_item)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="Tender not found")

    now = datetime.now(timezone.utc)
    is_deadline_passed = False
    remaining_seconds = 0
    if boq.deadline_at:
        deadline = boq.deadline_at if boq.deadline_at.tzinfo else boq.deadline_at.replace(tzinfo=timezone.utc)
        if now > deadline:
            is_deadline_passed = True
        else:
            remaining_seconds = int((deadline - now).total_seconds())

    custom_cols = []
    if boq.custom_columns_json:
        try:
            custom_cols = json.loads(boq.custom_columns_json)
        except Exception:
            custom_cols = []

    # Vendor submission
    sub = next((s for s in boq.submissions if s.vendor_organization_id == vendor_org_id), None)
    submission_data = None
    is_locked = is_deadline_passed or (sub is not None and sub.status == "SUBMITTED")

    if sub:
        submission_data = {
            "id": sub.id,
            "status": sub.status,
            "submission_type": sub.submission_type,
            "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
            "sub_total": sub.sub_total,
            "gst_percent": sub.gst_percent,
            "gst_amount": sub.gst_amount,
            "grand_total": sub.grand_total,
            "payment_terms": sub.payment_terms,
            "delivery_time": sub.delivery_time,
            "warranty_terms": sub.warranty_terms,
            "model_no": getattr(sub, "model_no", None),
            "tank_capacity_location": getattr(sub, "tank_capacity_location", None),
            "document_version_id": sub.document_version_id,
            "extracted_data": json.loads(sub.extracted_data_json) if getattr(sub, "extracted_data_json", None) else None,
            "items": [
                {
                    "submission_item_id": si.id,
                    "boq_item_id": si.boq_item_id,
                    "quoted_unit_price": si.quoted_unit_price,
                    "total_amount": si.total_amount,
                    "make_model_quoted": si.make_model_quoted,
                    "technical_compliance": si.technical_compliance,
                    "vendor_remarks": si.vendor_remarks
                }
                for si in sub.items
            ]
        }

    return {
        "id": boq.id,
        "tender_number": boq.tender_number or f"JECRC-BOQ-{boq.id[:8].upper()}",
        "title": boq.title,
        "department": boq.department,
        "description": boq.description,
        "boq_type": getattr(boq, "boq_type", "COMMERCIAL") or "COMMERCIAL",
        "status": "LOCKED" if is_deadline_passed else boq.status,
        "published_at": boq.published_at.isoformat() if boq.published_at else None,
        "deadline_at": boq.deadline_at.isoformat() if boq.deadline_at else None,
        "is_deadline_passed": is_deadline_passed,
        "is_locked": is_locked,
        "remaining_seconds": max(0, remaining_seconds),
        "allow_download": boq.allow_download,
        "document_version_id": boq.document_version_id,
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
                "attributes": json.loads(i.attributes_json) if i.attributes_json else {}
            }
            for i in boq.items
        ],
        "submission": submission_data
    }


@router.get("/{boq_id}/download-template")
async def download_vendor_template(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Download pre-formatted Excel template for filling bid offline.
    """
    stmt = select(BOQ).options(selectinload(BOQ.items)).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="Tender not found")

    if not boq.allow_download:
        raise HTTPException(status_code=403, detail="Document download is disabled by administrator for this tender.")

    stream = generate_boq_excel_template(boq)
    filename = f"Bid_Template_{boq.tender_number or boq.id[:8]}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/{boq_id}/submit")
async def submit_manual_bid(
    boq_id: str,
    payload: BidSubmissionPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Submits a manual bid. Enforces deadline lock and 1-time submission locking.
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="Tender not found")

    # 1. Enforce deadline lock
    now = datetime.now(timezone.utc)
    if boq.deadline_at:
        deadline = boq.deadline_at if boq.deadline_at.tzinfo else boq.deadline_at.replace(tzinfo=timezone.utc)
        if now > deadline:
            raise HTTPException(
                status_code=400, 
                detail="Tender submission deadline has passed. Submissions are strictly locked."
            )

    # 2. Enforce 1-time submission lock
    existing_sub = next((s for s in boq.submissions if s.vendor_organization_id == vendor_org_id), None)
    if existing_sub and existing_sub.status == "SUBMITTED":
        raise HTTPException(
            status_code=400, 
            detail="Your quotation has already been submitted and is permanently locked against further edits."
        )

    # Map items
    boq_items_map = {item.id: item for item in boq.items}
    sub_items = []
    sub_total = 0.0

    for it in payload.items:
        boq_item = boq_items_map.get(it.boq_item_id)
        if not boq_item:
            continue
        tot = it.quoted_unit_price * boq_item.quantity
        sub_total += tot
        sub_items.append({
            "boq_item_id": boq_item.id,
            "quoted_unit_price": it.quoted_unit_price,
            "total_amount": tot,
            "make_model_quoted": it.make_model_quoted,
            "technical_compliance": it.technical_compliance or "COMPLIANT",
            "vendor_remarks": it.vendor_remarks,
            "gst_percent": it.gst_percent if it.gst_percent is not None else 18.0,
            "gst_amount": tot * ((it.gst_percent if it.gst_percent is not None else 18.0) / 100.0)
        })

    gst_amt = sum(item["gst_amount"] for item in sub_items)
    gst_pct = 0.0 # Replaced by line-level GST, zeroing out global indicator
    grand_tot = sub_total + gst_amt

    # Create submission and lock it
    if not existing_sub:
        existing_sub = BOQSubmission(
            boq_id=boq.id,
            vendor_organization_id=vendor_org_id,
            submission_type="MANUAL"
        )
        db.add(existing_sub)
        await db.flush()
    else:
        # Clear previous draft items if any
        stmt_del = select(BOQSubmissionItem).where(BOQSubmissionItem.submission_id == existing_sub.id)
        old_items = (await db.execute(stmt_del)).scalars().all()
        for oi in old_items:
            await db.delete(oi)

    existing_sub.status = "SUBMITTED"
    existing_sub.submitted_at = now
    existing_sub.submission_type = "MANUAL"
    existing_sub.sub_total = sub_total
    existing_sub.gst_percent = gst_pct
    existing_sub.gst_amount = gst_amt
    existing_sub.grand_total = grand_tot
    existing_sub.payment_terms = payload.payment_terms
    existing_sub.delivery_time = payload.delivery_time
    existing_sub.warranty_terms = payload.warranty_terms

    for si in sub_items:
        item_obj = BOQSubmissionItem(
            submission_id=existing_sub.id,
            boq_item_id=si["boq_item_id"],
            quoted_unit_price=si["quoted_unit_price"],
            total_amount=si["total_amount"],
            make_model_quoted=si["make_model_quoted"],
            technical_compliance=si["technical_compliance"],
            vendor_remarks=si["vendor_remarks"],
            gst_percent=si["gst_percent"],
            gst_amount=si["gst_amount"]
        )
        db.add(item_obj)

    await db.commit()

    return {
        "status": "success",
        "message": "Bid submitted successfully and permanently locked.",
        "submission_id": existing_sub.id,
        "grand_total": grand_tot,
        "submitted_at": now.isoformat()
    }


@router.post("/{boq_id}/upload-bid")
async def upload_bid_file(
    boq_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Vendor uploads completed Excel bidding sheet or signed PDF quotation.
    Gemini AI parses quotes, maps them to line items, and immediately locks the submission.
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="Tender not found")

    # 1. Enforce deadline lock
    now = datetime.now(timezone.utc)
    if boq.deadline_at:
        deadline = boq.deadline_at if boq.deadline_at.tzinfo else boq.deadline_at.replace(tzinfo=timezone.utc)
        if now > deadline:
            raise HTTPException(
                status_code=400, 
                detail="Tender submission deadline has passed. Submissions are strictly locked."
            )

    # 2. Enforce 1-time submission lock
    existing_sub = next((s for s in boq.submissions if s.vendor_organization_id == vendor_org_id), None)
    if existing_sub and existing_sub.status == "SUBMITTED":
        raise HTTPException(
            status_code=400, 
            detail="Your quotation has already been submitted and is permanently locked against further edits."
        )

    file_bytes = await file.read()
    await file.seek(0)
    
    # 3. Store uploaded quotation file in Document storage
    doc_service = DocumentService(db, LocalStorageService())
    doc_ver = await doc_service.upload_document(
        vendor_organization_id=vendor_org_id,
        document_type="BOQ_VENDOR_BID",
        file=file,
        uploaded_by_user_id=user.id
    )

    try:
        parsed_bid = await parse_vendor_submission_file(boq, file_bytes, file.filename)
    except Exception as e:
        logger.error(f"Failed to parse vendor submission file {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract quotes from file: {str(e)}")

    # Create submission and lock it
    if not existing_sub:
        existing_sub = BOQSubmission(
            boq_id=boq.id,
            vendor_organization_id=vendor_org_id,
            submission_type=parsed_bid.get("submission_type", "EXCEL_UPLOAD")
        )
        db.add(existing_sub)
        await db.flush()
    else:
        # Clear previous items
        stmt_del = select(BOQSubmissionItem).where(BOQSubmissionItem.submission_id == existing_sub.id)
        old_items = (await db.execute(stmt_del)).scalars().all()
        for oi in old_items:
            await db.delete(oi)

    existing_sub.status = "SUBMITTED"
    existing_sub.submitted_at = now
    existing_sub.submission_type = parsed_bid.get("submission_type", "EXCEL_UPLOAD")
    existing_sub.sub_total = parsed_bid.get("sub_total", 0.0)
    existing_sub.gst_percent = parsed_bid.get("gst_percent", 18.0)
    existing_sub.gst_amount = parsed_bid.get("gst_amount", 0.0)
    existing_sub.grand_total = parsed_bid.get("grand_total", 0.0)
    existing_sub.payment_terms = parsed_bid.get("payment_terms")
    existing_sub.delivery_time = parsed_bid.get("delivery_time")
    existing_sub.warranty_terms = parsed_bid.get("warranty_terms")
    existing_sub.model_no = parsed_bid.get("model_no")
    existing_sub.tank_capacity_location = parsed_bid.get("tank_capacity_location")
    existing_sub.document_version_id = doc_ver.id
    # Store the FULL parsed_bid as extracted_data_json so commercial_breakdown, commercial_terms,
    # one_time_charges and all rich LMO commercial data are available to the frontend.
    full_extracted = {
        **(parsed_bid.get("raw_extraction") or {}),
        "commercial_breakdown": parsed_bid.get("commercial_breakdown"),
        "commercial_terms": parsed_bid.get("commercial_terms", {}),
        "model_no": parsed_bid.get("model_no"),
        "tank_capacity_location": parsed_bid.get("tank_capacity_location"),
        "payment_terms": parsed_bid.get("payment_terms"),
        "delivery_time": parsed_bid.get("delivery_time"),
        "warranty_terms": parsed_bid.get("warranty_terms"),
        "original_filename": file.filename,
        "document_version_id": doc_ver.id,
    }
    existing_sub.extracted_data_json = json.dumps(full_extracted)

    for si in parsed_bid.get("items", []):
        item_obj = BOQSubmissionItem(
            submission_id=existing_sub.id,
            boq_item_id=si["boq_item_id"],
            quoted_unit_price=si["quoted_unit_price"],
            total_amount=si["total_amount"],
            make_model_quoted=si.get("make_model_quoted"),
            technical_compliance=si.get("technical_compliance", "COMPLIANT"),
            vendor_remarks=si.get("vendor_remarks")
        )
        db.add(item_obj)

    await db.commit()

    return {
        "status": "success",
        "message": f"Quotation file '{file.filename}' successfully processed by Gemini AI in chunks and bid locked.",
        "submission_id": existing_sub.id,
        "grand_total": existing_sub.grand_total,
        "items_extracted": len(parsed_bid.get("items", [])),
        "document_version_id": doc_ver.id,
        "model_no": existing_sub.model_no,
        "tank_capacity_location": existing_sub.tank_capacity_location,
        "submitted_at": now.isoformat()
    }


@router.get("/{boq_id}/my-quote")
async def get_my_quote_details(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Vendor views their submitted quotation details, uploaded document metadata, and full chunk-extracted AI intelligence.
    """
    stmt = (
        select(BOQSubmission)
        .options(selectinload(BOQSubmission.items).selectinload(BOQSubmissionItem.boq_item))
        .where(
            BOQSubmission.boq_id == boq_id,
            BOQSubmission.vendor_organization_id == vendor_org_id
        )
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No submission found for this tender.")

    extracted = json.loads(sub.extracted_data_json) if getattr(sub, "extracted_data_json", None) else None

    # Get document version if available
    doc_info = None
    if sub.document_version_id:
        res_doc = await db.execute(select(DocumentVersion).where(DocumentVersion.id == sub.document_version_id))
        doc_ver = res_doc.scalar_one_or_none()
        if doc_ver:
            doc_info = {
                "id": doc_ver.id,
                "filename": doc_ver.original_filename,
                "file_size": doc_ver.file_size_bytes,
                "mime_type": doc_ver.mime_type,
                "created_at": doc_ver.created_at.isoformat() if doc_ver.created_at else None
            }

    return {
        "status": "success",
        "submission_id": sub.id,
        "submission_status": sub.status,
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        "submission_type": sub.submission_type,
        "grand_total": sub.grand_total,
        "sub_total": sub.sub_total,
        "gst_percent": sub.gst_percent,
        "gst_amount": sub.gst_amount,
        "model_no": getattr(sub, "model_no", None),
        "tank_capacity_location": getattr(sub, "tank_capacity_location", None),
        "payment_terms": sub.payment_terms,
        "delivery_time": sub.delivery_time,
        "warranty_terms": sub.warranty_terms,
        "document": doc_info,
        "extracted_intelligence": extracted,
        "items": [
            {
                "submission_item_id": si.id,
                "item_name": si.boq_item.item_name if si.boq_item else "Item",
                "item_code": si.boq_item.item_code if si.boq_item else "",
                "quantity": si.boq_item.quantity if si.boq_item else 1,
                "uom": si.boq_item.uom if si.boq_item else "Nos",
                "quoted_unit_price": si.quoted_unit_price,
                "total_amount": si.total_amount,
                "make_model_quoted": si.make_model_quoted,
                "technical_compliance": si.technical_compliance,
                "vendor_remarks": si.vendor_remarks
            }
            for si in sub.items
        ]
    }


@router.get("/{boq_id}/submission-document")
async def download_vendor_submission_document(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    vendor_org_id: str = Depends(get_vendor_org_id)
):
    """
    Download the vendor's uploaded quotation document.
    """
    stmt = select(BOQSubmission).where(
        BOQSubmission.boq_id == boq_id,
        BOQSubmission.vendor_organization_id == vendor_org_id
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub or not sub.document_version_id:
        raise HTTPException(status_code=404, detail="No quotation document attached to your submission.")

    res_doc = await db.execute(select(DocumentVersion).where(DocumentVersion.id == sub.document_version_id))
    doc_ver = res_doc.scalar_one_or_none()
    if not doc_ver:
        raise HTTPException(status_code=404, detail="Document version not found.")

    storage = LocalStorageService()
    file_bytes = await storage.get(doc_ver.stored_key)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="Quotation document file missing from storage.")

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc_ver.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc_ver.original_filename}"'}
    )


@router.get("/{boq_id}/document")
async def download_boq_document(
    boq_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Download the original BOQ document uploaded by the admin.
    """
    stmt = select(BOQ).where(BOQ.id == boq_id)
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise HTTPException(status_code=404, detail="BOQ not found")
        
    if not boq.document_version_id:
        raise HTTPException(status_code=404, detail="No original document attached to this BOQ")

    stmt_doc = select(DocumentVersion).where(DocumentVersion.id == boq.document_version_id)
    res_doc = await db.execute(stmt_doc)
    doc_ver = res_doc.scalar_one_or_none()
    if not doc_ver:
        raise HTTPException(status_code=404, detail="Document version file record not found")

    storage = LocalStorageService()
    file_bytes = await storage.get(doc_ver.stored_key)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="File content missing from storage")

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc_ver.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc_ver.original_filename}"'}
    )
