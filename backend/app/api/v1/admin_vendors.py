from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.vendor import VendorOrganization, VendorEvaluation
from app.api.deps import require_admin_or_vendor_owner, require_permission
from app.core.exceptions import APIException
from app.services.vendor import VendorService
from app.services.document import DocumentService
from app.services.questionnaire import QuestionnaireService
from app.services.catalog import CatalogService
from app.services.storage.local import LocalStorageService

router = APIRouter()

def get_vendor_service(db: AsyncSession = Depends(get_db)) -> VendorService:
    return VendorService(db)

def get_document_service(db: AsyncSession = Depends(get_db)) -> DocumentService:
    return DocumentService(db, LocalStorageService())

def get_questionnaire_service(db: AsyncSession = Depends(get_db)) -> QuestionnaireService:
    return QuestionnaireService(db)

def get_catalog_service(db: AsyncSession = Depends(get_db)) -> CatalogService:
    return CatalogService(db)


@router.get("")
async def admin_list_vendors(
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    from app.models.user import User
    from app.models.vendor import VendorEvaluation, VendorFinancials
    # Only show vendor organizations whose user has completed OTP verification
    verified_vendor_ids = select(User.vendor_organization_id).where(
        User.is_verified == True,
        User.vendor_organization_id.isnot(None)
    )
    stmt = (
        select(VendorOrganization)
        .options(
            selectinload(VendorOrganization.financials),
            selectinload(VendorOrganization.evaluations)
        )
        .where(VendorOrganization.id.in_(verified_vendor_ids))
        .order_by(desc(VendorOrganization.created_at))
    )
    
    result = await db.execute(stmt)
    vendors = result.scalars().all()
    
    res = []
    for v in vendors:
        # compute average turnover
        t_vals = []
        if v.financials:
            for val in [v.financials.turnover_fy1, v.financials.turnover_fy2, v.financials.turnover_fy3]:
                if val is not None:
                    try:
                        t_vals.append(float(val))
                    except (ValueError, TypeError):
                        pass
        avg_turnover = round(sum(t_vals) / len(t_vals), 2) if t_vals else None

        latest_eval = None
        if v.evaluations and len(v.evaluations) > 0:
            e = v.evaluations[0]
            latest_eval = {
                "id": e.id,
                "total_score": e.total_score,
                "evaluation_grade": e.evaluation_grade,
                "recommendation": e.recommendation,
                "evaluator_name": e.evaluator_name,
                "updated_at": e.updated_at.isoformat() if e.updated_at else None
            }

        res.append({
            "id": v.id,
            "legal_name": v.legal_name,
            "trade_name": v.trade_name,
            "organization_type": v.organization_type,
            "pan_number": v.pan_number,
            "country": v.country,
            "city": v.city,
            "state_province": v.state_province,
            "status": v.status,
            "verification_status": v.verification_status,
            "projects_completed_count": v.projects_completed_count,
            "has_service_base_jaipur": v.has_service_base_jaipur,
            "turnover_fy2": float(v.financials.turnover_fy2) if (v.financials and v.financials.turnover_fy2) else None,
            "avg_turnover": avg_turnover,
            "latest_evaluation": latest_eval,
            "created_at": v.created_at.isoformat() if v.created_at else None
        })
    return res


@router.get("/{vendor_id}")
async def admin_get_vendor_profile(
    vendor_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    vendor_service: VendorService = Depends(get_vendor_service)
):
    org_with_contacts = await vendor_service.get_vendor_by_id(vendor_id)
    return {
        "id": org_with_contacts.id,
        "vendor_code": org_with_contacts.vendor_code,
        "legal_name": org_with_contacts.legal_name,
        "trade_name": org_with_contacts.trade_name,
        "display_name": org_with_contacts.display_name,
        "short_name": org_with_contacts.short_name,
        "organization_type": org_with_contacts.organization_type,
        "vendor_category": org_with_contacts.vendor_category,
        "vendor_group": org_with_contacts.vendor_group,
        "vendor_type": org_with_contacts.vendor_type,
        "country": org_with_contacts.country,
        "state_province": org_with_contacts.state_province,
        "city": org_with_contacts.city,
        "address_line_1": org_with_contacts.address_line_1,
        "address_line_2": org_with_contacts.address_line_2,
        "postal_code": org_with_contacts.postal_code,
        "website": org_with_contacts.website,
        "primary_email": org_with_contacts.primary_email,
        "primary_phone": org_with_contacts.primary_phone,
        "alternate_phone": org_with_contacts.alternate_phone,
        "alternate_email": org_with_contacts.alternate_email,
        "primary_contact_person": org_with_contacts.primary_contact_person,
        "contact_designation": org_with_contacts.contact_designation,
        "head_name": org_with_contacts.head_name,
        "head_designation": org_with_contacts.head_designation,
        "head_email": org_with_contacts.head_email,
        "head_phone": org_with_contacts.head_phone,
        "pan_number": org_with_contacts.pan_number,
        "gstin": org_with_contacts.gstin,
        "gst_registration_type": org_with_contacts.gst_registration_type,
        "msme_registered": org_with_contacts.msme_registered,
        "tds_applicable": org_with_contacts.tds_applicable,
        "other_regulatory_registrations": org_with_contacts.other_regulatory_registrations,
        "business_registration_number": org_with_contacts.business_registration_number,
        "tax_identification_number": org_with_contacts.tax_identification_number,
        "payment_terms": org_with_contacts.payment_terms,
        "credit_days": org_with_contacts.credit_days,
        "currency": org_with_contacts.currency,
        "freight_terms": org_with_contacts.freight_terms,
        "delivery_terms": org_with_contacts.delivery_terms,
        "price_list_applicable": org_with_contacts.price_list_applicable,
        "rate_contract_applicable": org_with_contacts.rate_contract_applicable,
        "supply_category": org_with_contacts.supply_category,
        "primary_business_type": org_with_contacts.primary_business_type,
        "product_service_type": org_with_contacts.product_service_type,
        "geographical_coverage": org_with_contacts.geographical_coverage,
        "supply_categories_list": org_with_contacts.supply_categories_list,
        "years_in_business": org_with_contacts.years_in_business,
        "projects_completed_count": org_with_contacts.projects_completed_count,
        "high_value_projects_count": org_with_contacts.high_value_projects_count,
        "high_value_projects_threshold_cr": float(org_with_contacts.high_value_projects_threshold_cr) if org_with_contacts.high_value_projects_threshold_cr is not None else 1.0,
        "has_service_base_jaipur": org_with_contacts.has_service_base_jaipur,
        "is_blacklisted": org_with_contacts.is_blacklisted,
        "pending_litigation": org_with_contacts.pending_litigation,
        "not_debarred_declaration": org_with_contacts.not_debarred_declaration,
        "status": org_with_contacts.status,
        "verification_status": org_with_contacts.verification_status,
        "contacts": [
            {
                "id": c.id,
                "full_name": c.full_name,
                "designation": c.designation,
                "department": c.department,
                "email": c.email,
                "phone": c.phone,
                "contact_type": c.contact_type,
                "is_primary": c.is_primary
            } for c in (org_with_contacts.contacts or [])
        ],
        "bank_details": [
            {
                "id": b.id,
                "bank_name": b.bank_name,
                "branch_name": b.branch_name,
                "account_name": b.account_name,
                "account_number": b.account_number,
                "ifsc_code": b.ifsc_code,
                "account_type": b.account_type
            } for b in (org_with_contacts.bank_details or [])
        ],
        "financials": [
            {
                "id": org_with_contacts.financials.id,
                "turnover_fy1": float(org_with_contacts.financials.turnover_fy1) if org_with_contacts.financials.turnover_fy1 else None,
                "turnover_fy2": float(org_with_contacts.financials.turnover_fy2) if org_with_contacts.financials.turnover_fy2 else None,
                "turnover_fy3": float(org_with_contacts.financials.turnover_fy3) if org_with_contacts.financials.turnover_fy3 else None,
                "infrastructure_base_details": org_with_contacts.financials.infrastructure_base_details
            }
        ] if org_with_contacts.financials else [],
        "projects": [
            {
                "id": p.id,
                "hospital_name": p.hospital_name,
                "bed_count": p.bed_count,
                "is_300_plus_beds": p.is_300_plus_beds,
                "project_cost": p.project_cost,
                "project_duration": p.project_duration,
                "financial_year": p.financial_year,
                "scope_of_work": p.scope_of_work
            } for p in (org_with_contacts.projects or [])
        ],
        "evaluations": [
            {
                "id": e.id,
                "hospitals_score": e.hospitals_score,
                "hospitals_meets": e.hospitals_meets,
                "hospitals_remarks": e.hospitals_remarks,
                "turnover_score": e.turnover_score,
                "turnover_meets": e.turnover_meets,
                "turnover_remarks": e.turnover_remarks,
                "high_value_projects_score": e.high_value_projects_score,
                "high_value_projects_meets": e.high_value_projects_meets,
                "high_value_projects_remarks": e.high_value_projects_remarks,
                "service_base_score": e.service_base_score,
                "service_base_meets": e.service_base_meets,
                "service_base_remarks": e.service_base_remarks,
                "balance_sheet_score": e.balance_sheet_score,
                "balance_sheet_verified": e.balance_sheet_verified,
                "balance_sheet_remarks": e.balance_sheet_remarks,
                "total_score": e.total_score,
                "evaluation_grade": e.evaluation_grade,
                "recommendation": e.recommendation,
                "evaluator_name": e.evaluator_name,
                "admin_summary_notes": e.admin_summary_notes,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "updated_at": e.updated_at.isoformat() if e.updated_at else None
            } for e in sorted(org_with_contacts.evaluations or [], key=lambda x: str(x.created_at or ""), reverse=True)
        ]
    }


@router.get("/{vendor_id}/evaluation")
async def admin_get_vendor_evaluation(
    vendor_id: str = Path(...),
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    stmt = select(VendorEvaluation).where(VendorEvaluation.vendor_organization_id == vendor_id).order_by(desc(VendorEvaluation.created_at))
    res = await db.execute(stmt)
    evaluation = res.scalars().first()
    if not evaluation:
        return {"evaluation": None}
    return {
        "evaluation": {
            "id": evaluation.id,
            "vendor_organization_id": evaluation.vendor_organization_id,
            "hospitals_score": evaluation.hospitals_score,
            "hospitals_meets": evaluation.hospitals_meets,
            "hospitals_remarks": evaluation.hospitals_remarks,
            "turnover_score": evaluation.turnover_score,
            "turnover_meets": evaluation.turnover_meets,
            "turnover_remarks": evaluation.turnover_remarks,
            "high_value_projects_score": evaluation.high_value_projects_score,
            "high_value_projects_meets": evaluation.high_value_projects_meets,
            "high_value_projects_remarks": evaluation.high_value_projects_remarks,
            "service_base_score": evaluation.service_base_score,
            "service_base_meets": evaluation.service_base_meets,
            "service_base_remarks": evaluation.service_base_remarks,
            "balance_sheet_score": evaluation.balance_sheet_score,
            "balance_sheet_verified": evaluation.balance_sheet_verified,
            "balance_sheet_remarks": evaluation.balance_sheet_remarks,
            "total_score": evaluation.total_score,
            "evaluation_grade": evaluation.evaluation_grade,
            "recommendation": evaluation.recommendation,
            "evaluator_name": evaluation.evaluator_name,
            "admin_summary_notes": evaluation.admin_summary_notes,
            "created_at": evaluation.created_at.isoformat() if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.isoformat() if evaluation.updated_at else None
        }
    }


@router.post("/{vendor_id}/evaluation")
async def admin_save_vendor_evaluation(
    vendor_id: str = Path(...),
    data: Dict[str, Any] = None,
    db: AsyncSession = Depends(get_db),
    current_admin = Depends(require_permission("vendors.approve"))
):
    if data is None:
        data = {}
        
    stmt = select(VendorOrganization).where(VendorOrganization.id == vendor_id)
    org = (await db.execute(stmt)).scalar_one_or_none()
    if not org:
        raise APIException("NOT_FOUND", "Vendor organization not found.", 404)

    # Check if an evaluation already exists for this vendor
    stmt_eval = select(VendorEvaluation).where(VendorEvaluation.vendor_organization_id == vendor_id).order_by(desc(VendorEvaluation.created_at))
    evaluation = (await db.execute(stmt_eval)).scalars().first()

    # Calculate scores
    hospitals_score = min(max(int(data.get("hospitals_score", 0)), 0), 20)
    turnover_score = min(max(int(data.get("turnover_score", 0)), 0), 20)
    high_value_projects_score = min(max(int(data.get("high_value_projects_score", 0)), 0), 20)
    service_base_score = min(max(int(data.get("service_base_score", 0)), 0), 20)
    balance_sheet_score = min(max(int(data.get("balance_sheet_score", 0)), 0), 20)
    total_score = hospitals_score + turnover_score + high_value_projects_score + service_base_score + balance_sheet_score

    # Auto grade if not explicitly passed
    grade = data.get("evaluation_grade")
    if not grade:
        if total_score >= 85:
            grade = "A_GRADE"
        elif total_score >= 70:
            grade = "B_GRADE"
        elif total_score >= 50:
            grade = "C_GRADE"
        else:
            grade = "D_GRADE"

    evaluator_name = getattr(current_admin, "full_name", None) or getattr(current_admin, "username", "Admin")

    if not evaluation:
        evaluation = VendorEvaluation(
            vendor_organization_id=vendor_id,
            hospitals_score=hospitals_score,
            hospitals_meets=bool(data.get("hospitals_meets", False)),
            hospitals_remarks=data.get("hospitals_remarks"),
            turnover_score=turnover_score,
            turnover_meets=bool(data.get("turnover_meets", False)),
            turnover_remarks=data.get("turnover_remarks"),
            high_value_projects_score=high_value_projects_score,
            high_value_projects_meets=bool(data.get("high_value_projects_meets", False)),
            high_value_projects_remarks=data.get("high_value_projects_remarks"),
            service_base_score=service_base_score,
            service_base_meets=bool(data.get("service_base_meets", False)),
            service_base_remarks=data.get("service_base_remarks"),
            balance_sheet_score=balance_sheet_score,
            balance_sheet_verified=bool(data.get("balance_sheet_verified", False)),
            balance_sheet_remarks=data.get("balance_sheet_remarks"),
            total_score=total_score,
            evaluation_grade=grade,
            recommendation=data.get("recommendation", "QUALIFIED"),
            evaluator_name=evaluator_name,
            admin_summary_notes=data.get("admin_summary_notes")
        )
        db.add(evaluation)
    else:
        evaluation.hospitals_score = hospitals_score
        evaluation.hospitals_meets = bool(data.get("hospitals_meets", False))
        evaluation.hospitals_remarks = data.get("hospitals_remarks")
        evaluation.turnover_score = turnover_score
        evaluation.turnover_meets = bool(data.get("turnover_meets", False))
        evaluation.turnover_remarks = data.get("turnover_remarks")
        evaluation.high_value_projects_score = high_value_projects_score
        evaluation.high_value_projects_meets = bool(data.get("high_value_projects_meets", False))
        evaluation.high_value_projects_remarks = data.get("high_value_projects_remarks")
        evaluation.service_base_score = service_base_score
        evaluation.service_base_meets = bool(data.get("service_base_meets", False))
        evaluation.service_base_remarks = data.get("service_base_remarks")
        evaluation.balance_sheet_score = balance_sheet_score
        evaluation.balance_sheet_verified = bool(data.get("balance_sheet_verified", False))
        evaluation.balance_sheet_remarks = data.get("balance_sheet_remarks")
        evaluation.total_score = total_score
        evaluation.evaluation_grade = grade
        evaluation.recommendation = data.get("recommendation", evaluation.recommendation)
        evaluation.evaluator_name = evaluator_name
        evaluation.admin_summary_notes = data.get("admin_summary_notes")

    await db.commit()
    await db.refresh(evaluation)

    return {
        "message": "Vendor evaluation saved successfully.",
        "evaluation": {
            "id": evaluation.id,
            "total_score": evaluation.total_score,
            "evaluation_grade": evaluation.evaluation_grade,
            "recommendation": evaluation.recommendation,
            "evaluator_name": evaluation.evaluator_name
        }
    }


@router.post("/{vendor_id}/verify")
async def admin_verify_vendor(
    vendor_id: str = Path(...),
    action: str = "approve",
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    from sqlalchemy import update
    from app.models.extraction import CatalogProductDraft

    stmt = select(VendorOrganization).where(VendorOrganization.id == vendor_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    
    if not org:
        raise APIException("NOT_FOUND", "Vendor not found.", 404)
        
    if org.status not in ["SUBMITTED", "UNDER_REVIEW"]:
        raise APIException("BAD_REQUEST", "Vendor must be in SUBMITTED or UNDER_REVIEW state to be verified.", 400)
        
    if action == "approve":
        org.status = "APPROVED"
        org.verification_status = "VERIFIED"
        # Auto-approve all catalog product drafts for this vendor
        await db.execute(
            update(CatalogProductDraft)
            .where(CatalogProductDraft.vendor_organization_id == vendor_id)
            .values(status="APPROVED")
        )
    elif action == "reject":
        org.status = "REJECTED"
        org.verification_status = "UNVERIFIED"
    else:
        raise APIException("BAD_REQUEST", "Invalid action. Use 'approve' or 'reject'.", 400)
        
    await db.commit()
    return {"status": "success", "vendor_status": org.status, "verification_status": org.verification_status}


@router.delete("/{vendor_id}")
async def admin_delete_vendor(
    vendor_id: str = Path(...),
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    stmt = select(VendorOrganization).where(VendorOrganization.id == vendor_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    
    if not org:
        raise APIException("NOT_FOUND", "Vendor not found.", 404)
        
    legal_name = org.legal_name
    primary_email = org.primary_email
    
    # Delete associated user accounts so the email is freed up for future re-registration
    from app.models.user import User
    from sqlalchemy import or_
    
    user_conditions = [User.vendor_organization_id == vendor_id]
    if primary_email:
        user_conditions.append(User.email == primary_email.lower())
        
    users_stmt = select(User).where(or_(*user_conditions))
    users_res = await db.execute(users_stmt)
    users_to_delete = users_res.scalars().all()
    for u in users_to_delete:
        await db.delete(u)
    await db.flush()

    await db.delete(org)
    await db.commit()
    return {"status": "success", "message": f"Vendor '{legal_name}' and associated user accounts deleted successfully."}


# ==========================================
# ADMIN DOCUMENT INSPECTION
# ==========================================

@router.get("/{vendor_id}/documents")
async def admin_list_vendor_documents(
    vendor_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    doc_service: DocumentService = Depends(get_document_service)
):
    docs = await doc_service.get_vendor_documents(org.id)
    return [
        {
            "id": d.id,
            "document_type": d.document_type,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "latest_version": {
                "id": d.versions[0].id,
                "version_number": d.versions[0].version_number,
                "original_filename": d.versions[0].original_filename,
                "mime_type": d.versions[0].mime_type,
                "file_size": d.versions[0].file_size,
                "created_at": d.versions[0].created_at.isoformat() if d.versions[0].created_at else None
            } if d.versions else None
        } for d in docs
    ]


@router.get("/{vendor_id}/documents/{document_id}")
async def admin_get_vendor_document(
    vendor_id: str,
    document_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    doc_service: DocumentService = Depends(get_document_service)
):
    doc = await doc_service.get_document(org.id, document_id)
    return {
        "id": doc.id,
        "document_type": doc.document_type,
        "status": doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "versions": [
            {
                "id": v.id,
                "version_number": v.version_number,
                "original_filename": v.original_filename,
                "mime_type": v.mime_type,
                "file_size": v.file_size,
                "checksum_sha256": v.checksum_sha256,
                "created_at": v.created_at.isoformat() if v.created_at else None
            } for v in doc.versions
        ]
    }


@router.get("/{vendor_id}/documents/{document_id}/versions")
async def admin_get_vendor_document_versions(
    vendor_id: str,
    document_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    doc_service: DocumentService = Depends(get_document_service)
):
    versions = await doc_service.get_document_versions(org.id, document_id)
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "original_filename": v.original_filename,
            "mime_type": v.mime_type,
            "file_size": v.file_size,
            "checksum_sha256": v.checksum_sha256,
            "created_at": v.created_at.isoformat() if v.created_at else None
        } for v in versions
    ]


@router.get("/{vendor_id}/documents/{document_id}/download")
async def admin_download_vendor_document(
    vendor_id: str,
    document_id: str,
    version_id: Optional[str] = Query(None),
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    doc_service: DocumentService = Depends(get_document_service)
):
    content, filename, mime_type = await doc_service.get_document_download_content(
        vendor_organization_id=org.id,
        document_id=document_id,
        version_id=version_id
    )
    return Response(
        content=content,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ==========================================
# ADMIN QUESTIONNAIRE INSPECTION
# ==========================================

@router.get("/{vendor_id}/questionnaires")
async def admin_list_vendor_questionnaires(
    vendor_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    resps = await q_service.get_vendor_questionnaires(org.id)
    return [
        {
            "id": r.id,
            "template_version_id": r.template_version_id,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None
        } for r in resps
    ]


@router.get("/{vendor_id}/questionnaires/{response_id}")
async def admin_get_vendor_questionnaire(
    vendor_id: str,
    response_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    resp = await q_service.get_questionnaire_response(org.id, response_id)
    return {
        "id": resp.id,
        "template_version_id": resp.template_version_id,
        "status": resp.status,
        "created_at": resp.created_at.isoformat() if resp.created_at else None,
        "answers": [
            {
                "id": qr.id,
                "question_id": qr.question_id,
                "response_value_text": qr.response_value_text,
                "response_value_numeric": float(qr.response_value_numeric) if qr.response_value_numeric is not None else None,
                "response_value_boolean": qr.response_value_boolean,
                "evidence_documents": [
                    {
                        "id": qrd.id,
                        "document_version_id": qrd.document_version_id
                    } for qrd in qr.evidence_documents
                ]
            } for qr in resp.question_responses
        ]
    }


# ==========================================
# ADMIN CATALOG INSPECTION
# ==========================================

@router.get("/{vendor_id}/catalogs")
async def admin_list_vendor_catalogs(
    vendor_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    catalog_service: CatalogService = Depends(get_catalog_service)
):
    catalogs = await catalog_service.get_catalogs(org.id)
    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "catalog_year": c.catalog_year,
            "document_version_id": c.document_version_id,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        } for c in catalogs
    ]


@router.get("/{vendor_id}/catalogs/{catalog_id}")
async def admin_get_vendor_catalog(
    vendor_id: str,
    catalog_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    catalog_service: CatalogService = Depends(get_catalog_service)
):
    catalog = await catalog_service.get_catalog(org.id, catalog_id)
    return {
        "id": catalog.id,
        "title": catalog.title,
        "description": catalog.description,
        "catalog_year": catalog.catalog_year,
        "document_version_id": catalog.document_version_id,
        "status": catalog.status,
        "created_at": catalog.created_at.isoformat() if catalog.created_at else None
    }


@router.get("/{vendor_id}/catalogs/{catalog_id}/versions")
@router.get("/{vendor_id}/catalogs/{catalog_id}/versions")
async def admin_get_vendor_catalog_versions(
    vendor_id: str,
    catalog_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    catalog_service: CatalogService = Depends(get_catalog_service)
):
    versions = await catalog_service.get_catalog_versions(org.id, catalog_id)
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "original_filename": v.original_filename,
            "mime_type": v.mime_type,
            "file_size": v.file_size,
            "checksum_sha256": v.checksum_sha256,
            "created_at": v.created_at.isoformat() if v.created_at else None
        } for v in versions
    ]

@router.get("/{vendor_id}/catalogs/{catalog_id}/products")
async def admin_get_vendor_catalog_products(
    vendor_id: str,
    catalog_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    db: AsyncSession = Depends(get_db)
):
    from app.models.extraction import CatalogProductDraft
    from sqlalchemy.future import select
    
    stmt = select(CatalogProductDraft).where(
        CatalogProductDraft.vendor_organization_id == org.id,
        CatalogProductDraft.catalog_id == catalog_id
    ).order_by(CatalogProductDraft.created_at.desc())
    
    res = await db.execute(stmt)
    products = res.scalars().all()
    
    return [
        {
            "id": p.id,
            "product_name": p.product_name,
            "description": p.description,
            "attributes_json": p.attributes_json,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "rejection_reason": p.rejection_reason
        } for p in products
    ]

from pydantic import BaseModel, Field
class AdminSemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=50)
    vendor_organization_id: Optional[str] = Field(None, description="Optional vendor filter")

@router.post("/search")
async def admin_search_catalog(
    payload: AdminSemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.read"))
):
    from app.services.ai.embedding import GeminiEmbeddingProvider
    from app.services.vector.qdrant import QdrantVectorSearchService
    from app.models.extraction import CatalogProductDraft
    from sqlalchemy.future import select
    
    # 1. Generate query embedding
    provider = GeminiEmbeddingProvider()
    try:
        query_vector = await provider.generate_embedding(payload.query)
    except Exception as e:
        raise APIException("SERVICE_UNAVAILABLE", "Search service is currently unavailable.", 503)
        
    # 2. Qdrant search
    vector_service = QdrantVectorSearchService()
    filter_metadata = {}
    if payload.vendor_organization_id:
        filter_metadata["vendor_organization_id"] = payload.vendor_organization_id

    try:
        results = await vector_service.search_by_vector(
            query_vector=query_vector,
            limit=payload.limit,
            filter_metadata=filter_metadata if filter_metadata else None
        )
    except Exception as e:
        raise APIException("SERVICE_UNAVAILABLE", "Search service is currently unavailable.", 503)
        
    if not results:
        return {"results": []}
        
    # 3. Fetch authoritative records from MySQL and validate
    draft_ids = [hit["id"] for hit in results]
    
    stmt = select(CatalogProductDraft).where(
        CatalogProductDraft.id.in_(draft_ids),
        CatalogProductDraft.status == "APPROVED"
    )
    if payload.vendor_organization_id:
        stmt = stmt.where(CatalogProductDraft.vendor_organization_id == payload.vendor_organization_id)

    db_res = await db.execute(stmt)
    db_drafts = {draft.id: draft for draft in db_res.scalars().all()}
    
    # 4. Construct response, discarding any stale vectors
    validated_results = []
    for hit in results:
        draft_id = hit["id"]
        draft = db_drafts.get(draft_id)
        if draft:
            validated_results.append({
                "id": draft.id,
                "catalog_id": draft.catalog_id,
                "vendor_organization_id": draft.vendor_organization_id,
                "product_name": draft.product_name,
                "attributes": draft.attributes_json,
                "score": hit["score"]
            })
            
    return {"results": validated_results}
