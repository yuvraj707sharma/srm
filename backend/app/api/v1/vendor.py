from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from typing import List, Dict, Any, Optional

from app.db.session import get_db
from app.models.user import User
from app.models.vendor import VendorOrganization, VendorContact
from app.api.deps import get_current_user, get_current_vendor_context
from app.services.vendor import VendorService
from app.services.document import DocumentService
from app.services.questionnaire import QuestionnaireService
from app.services.catalog import CatalogService
from app.services.storage.local import LocalStorageService
from app.core.exceptions import APIException

router = APIRouter()

def get_vendor_service(db: AsyncSession = Depends(get_db)) -> VendorService:
    return VendorService(db)
    
def get_document_service(db: AsyncSession = Depends(get_db)) -> DocumentService:
    return DocumentService(db, LocalStorageService())

def get_questionnaire_service(db: AsyncSession = Depends(get_db)) -> QuestionnaireService:
    return QuestionnaireService(db)

def get_catalog_service(db: AsyncSession = Depends(get_db)) -> CatalogService:
    return CatalogService(db)


# ==========================================
# VENDOR PROFILE & REGISTRATION
# ==========================================

@router.post("/register")
async def register_vendor(
    data: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    vendor_service: VendorService = Depends(get_vendor_service)
):
    legal_name = data.get("legal_name")
    organization_type = data.get("organization_type")
    
    if not legal_name or not organization_type:
        raise APIException("BAD_REQUEST", "legal_name and organization_type are required.", 400)
        
    org = await vendor_service.register_vendor(current_user, legal_name, organization_type)
    return {"id": org.id, "legal_name": org.legal_name, "status": org.status}


@router.get("/me")
async def get_my_vendor_profile(
    org: VendorOrganization = Depends(get_current_vendor_context),
    vendor_service: VendorService = Depends(get_vendor_service)
):
    org_with_contacts = await vendor_service.get_vendor_by_id(org.id)
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
        "pan_number": org_with_contacts.pan_number,
        "gstin": org_with_contacts.gstin,
        "gst_registration_type": org_with_contacts.gst_registration_type,
        "msme_registered": org_with_contacts.msme_registered,
        "tds_applicable": org_with_contacts.tds_applicable,
        "other_regulatory_registrations": org_with_contacts.other_regulatory_registrations,
        "primary_contact_person": org_with_contacts.primary_contact_person,
        "contact_designation": org_with_contacts.contact_designation,
        "alternate_email": org_with_contacts.alternate_email,
        "head_name": org_with_contacts.head_name,
        "head_designation": org_with_contacts.head_designation,
        "head_email": org_with_contacts.head_email,
        "head_phone": org_with_contacts.head_phone,
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
        "business_registration_number": org_with_contacts.business_registration_number,
        "tax_identification_number": org_with_contacts.tax_identification_number,
        "payment_terms": org_with_contacts.payment_terms,
        "credit_days": org_with_contacts.credit_days,
        "currency": org_with_contacts.currency,
        "freight_terms": org_with_contacts.freight_terms,
        "delivery_terms": org_with_contacts.delivery_terms,
        "price_list_applicable": org_with_contacts.price_list_applicable,
        "rate_contract_applicable": org_with_contacts.rate_contract_applicable,
        "contract_start_date": org_with_contacts.contract_start_date.isoformat() if org_with_contacts.contract_start_date else None,
        "contract_end_date": org_with_contacts.contract_end_date.isoformat() if org_with_contacts.contract_end_date else None,
        "supply_category": org_with_contacts.supply_category,
        "primary_business_type": org_with_contacts.primary_business_type,
        "product_service_type": org_with_contacts.product_service_type,
        "geographical_coverage": org_with_contacts.geographical_coverage,
        "supply_categories_list": org_with_contacts.supply_categories_list,
        "years_in_business": org_with_contacts.years_in_business,
        "projects_completed_count": org_with_contacts.projects_completed_count,
        "high_value_projects_count": org_with_contacts.high_value_projects_count,
        "has_service_base_jaipur": org_with_contacts.has_service_base_jaipur,
        "is_blacklisted": org_with_contacts.is_blacklisted,
        "pending_litigation": org_with_contacts.pending_litigation,
        "not_debarred_declaration": org_with_contacts.not_debarred_declaration,
        "status": org_with_contacts.status,
        "verification_status": org_with_contacts.verification_status,
        "bank_details": {
            "bank_name": org_with_contacts.bank_details[0].bank_name,
            "branch_name": org_with_contacts.bank_details[0].branch_name,
            "account_name": org_with_contacts.bank_details[0].account_name,
            "account_number": org_with_contacts.bank_details[0].account_number,
            "ifsc_code": org_with_contacts.bank_details[0].ifsc_code,
            "account_type": org_with_contacts.bank_details[0].account_type
        } if (org_with_contacts.bank_details and len(org_with_contacts.bank_details) > 0) else None,
        "financials": {
            "turnover_fy1": float(org_with_contacts.financials.turnover_fy1) if (org_with_contacts.financials and org_with_contacts.financials.turnover_fy1) else None,
            "turnover_fy2": float(org_with_contacts.financials.turnover_fy2) if (org_with_contacts.financials and org_with_contacts.financials.turnover_fy2) else None,
            "turnover_fy3": float(org_with_contacts.financials.turnover_fy3) if (org_with_contacts.financials and org_with_contacts.financials.turnover_fy3) else None,
            "infrastructure_base_details": org_with_contacts.financials.infrastructure_base_details if org_with_contacts.financials else None
        } if org_with_contacts.financials else None,
        "projects": [
            {
                "id": p.id,
                "hospital_name": p.hospital_name,
                "bed_count": p.bed_count,
                "is_300_plus_beds": p.is_300_plus_beds,
                "project_cost": float(p.project_cost) if p.project_cost else None,
                "project_duration": p.project_duration,
                "financial_year": p.financial_year,
                "scope_of_work": p.scope_of_work
            } for p in (org_with_contacts.projects or [])
        ],
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
        ]
    }


@router.patch("/me")
async def update_my_vendor_profile(
    data: Dict[str, Any],
    org: VendorOrganization = Depends(get_current_vendor_context),
    vendor_service: VendorService = Depends(get_vendor_service)
):
    if org.status not in ["DRAFT", "REJECTED"]:
        raise APIException("FORBIDDEN", f"Profile is locked in '{org.status}' status and cannot be edited. Edits are disabled while under review or after approval.", 403)
        
    if "bank_details" in data:
        await vendor_service.upsert_bank_details(org.id, data.pop("bank_details"))
        
    if "financials" in data:
        await vendor_service.upsert_financials(org.id, data.pop("financials"))

    if "projects" in data:
        await vendor_service.upsert_projects(org.id, data.pop("projects"))

    updated_org = await vendor_service.update_vendor_profile(org, data)
    return {"status": "success", "id": updated_org.id}


@router.post("/me/submit")
async def submit_vendor_profile(
    org: VendorOrganization = Depends(get_current_vendor_context),
    vendor_service: VendorService = Depends(get_vendor_service)
):
    updated_org = await vendor_service.submit_for_review(org)
    return {"status": "success", "new_status": updated_org.status}


# ==========================================
# DOCUMENTS
# ==========================================

@router.get("/documents")
async def list_my_documents(
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.post("/documents")
async def upload_document(
    document_type: str,
    file: UploadFile = File(...),
    document_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    org: VendorOrganization = Depends(get_current_vendor_context),
    doc_service: DocumentService = Depends(get_document_service)
):
    if org.status not in ["DRAFT", "REJECTED"] and document_type != "PRODUCT_CATALOG":
        raise APIException("FORBIDDEN", f"Profile is currently in '{org.status}' status. Document uploads are locked until review is completed.", 403)

    doc_version = await doc_service.upload_document(
        vendor_organization_id=org.id,
        document_type=document_type,
        file=file,
        uploaded_by_user_id=current_user.id,
        document_id=document_id
    )
    
    # Auto-create catalog and trigger extraction if PRODUCT_CATALOG
    if document_type == "PRODUCT_CATALOG":
        from app.services.catalog import CatalogService
        from app.services.extraction import ExtractionService
        
        catalog_service = CatalogService(doc_service.db)
        extraction_service = ExtractionService(doc_service.db)
        
        catalog = await catalog_service.upload_catalog(
            vendor_organization_id=org.id,
            title=f"Catalog - {doc_version.original_filename}",
            document_version_id=doc_version.id,
            description="Auto-extracted catalog from uploaded document"
        )
        await extraction_service.enqueue_catalog_extraction(org.id, catalog.id)

    return {
        "document_id": doc_version.document_id,
        "version_id": doc_version.id,
        "version_number": doc_version.version_number,
        "original_filename": doc_version.original_filename,
        "mime_type": doc_version.mime_type,
        "file_size": doc_version.file_size
    }


@router.get("/documents/{document_id}")
async def get_document_details(
    document_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.get("/documents/{document_id}/versions")
async def get_document_versions(
    document_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    version_id: Optional[str] = Query(None),
    org: VendorOrganization = Depends(get_current_vendor_context),
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
# QUESTIONNAIRES
# ==========================================

@router.get("/questionnaires/templates")
async def list_available_templates(
    context_type: str = "ONBOARDING",
    org: VendorOrganization = Depends(get_current_vendor_context),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    templates = await q_service.get_available_templates(context_type)
    output = []
    for t in templates:
        pub_versions = [v for v in t.versions if v.status == "PUBLISHED"]
        for v in pub_versions:
            output.append({
                "template_id": t.id,
                "template_title": t.title,
                "context_type": t.context_type,
                "template_version_id": v.id,
                "version_number": v.version_number,
                "question_count": len(v.questions),
                "questions": [
                    {
                        "id": q.id,
                        "question_text": q.question_text,
                        "question_type": q.question_type,
                        "is_required": q.is_required,
                        "display_order": q.display_order,
                        "validation_rules": q.validation_rules,
                        "options": q.options,
                        "units": q.units,
                        "evidence_required": q.evidence_required
                    } for q in v.questions
                ]
            })
    return output


@router.get("/questionnaires/templates/{template_version_id}")
async def get_template_version_details(
    template_version_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    version = await q_service.get_published_template_version(template_version_id)
    return {
        "template_id": version.template_id,
        "template_title": version.template.title,
        "template_version_id": version.id,
        "version_number": version.version_number,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "is_required": q.is_required,
                "display_order": q.display_order,
                "validation_rules": q.validation_rules,
                "options": q.options,
                "units": q.units,
                "evidence_required": q.evidence_required
            } for q in version.questions
        ]
    }


@router.get("/questionnaires")
async def list_my_questionnaires(
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.post("/questionnaires/{template_version_id}/responses")
async def start_questionnaire_response(
    template_version_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    resp = await q_service.start_questionnaire(org.id, template_version_id)
    return {"id": resp.id, "template_version_id": resp.template_version_id, "status": resp.status}


@router.get("/questionnaires/{response_id}")
async def get_questionnaire_response_details(
    response_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.post("/questionnaires/{response_id}/save")
async def save_questionnaire_answers(
    response_id: str,
    payload: Dict[str, Any],
    org: VendorOrganization = Depends(get_current_vendor_context),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    answers = payload.get("answers", [])
    evidence_map = payload.get("evidence", {})
    resp = await q_service.save_questionnaire_answers(
        vendor_organization_id=org.id,
        response_id=response_id,
        answers=answers,
        evidence_map=evidence_map
    )
    return {"status": "success", "id": resp.id, "response_status": resp.status}


@router.post("/questionnaires/{response_id}/submit")
async def submit_questionnaire_response(
    response_id: str,
    payload: Optional[Dict[str, Any]] = None,
    org: VendorOrganization = Depends(get_current_vendor_context),
    q_service: QuestionnaireService = Depends(get_questionnaire_service)
):
    answers = payload.get("answers") if payload else None
    evidence_map = payload.get("evidence") if payload else None
    resp = await q_service.submit_response(
        vendor_organization_id=org.id,
        response_id=response_id,
        answers=answers,
        evidence_map=evidence_map
    )
    return {"status": "success", "id": resp.id, "new_status": resp.status}


# ==========================================
# CATALOGS
# ==========================================

@router.get("/catalogs")
async def list_my_catalogs(
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.post("/catalogs")
async def create_catalog(
    payload: Dict[str, Any],
    org: VendorOrganization = Depends(get_current_vendor_context),
    catalog_service: CatalogService = Depends(get_catalog_service)
):
    title = payload.get("title")
    document_version_id = payload.get("document_version_id")
    description = payload.get("description")
    catalog_year = payload.get("catalog_year")

    if not title or not document_version_id:
        raise APIException("BAD_REQUEST", "title and document_version_id are required.", 400)

    catalog = await catalog_service.upload_catalog(
        vendor_organization_id=org.id,
        title=title,
        document_version_id=document_version_id,
        description=description,
        catalog_year=catalog_year
    )
    return {
        "id": catalog.id,
        "title": catalog.title,
        "document_version_id": catalog.document_version_id,
        "status": catalog.status
    }


def get_extraction_service(db: AsyncSession = Depends(get_db)):
    from app.services.extraction import ExtractionService
    return ExtractionService(db)


@router.post("/catalogs/{catalog_id}/extract")
async def extract_catalog_data(
    catalog_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    job = await extraction_service.enqueue_catalog_extraction(org.id, catalog_id)
    return {
        "job_id": job.id,
        "catalog_id": job.catalog_id,
        "document_version_id": job.document_version_id,
        "status": job.status,
        "created_at": job.created_at.isoformat() if job.created_at else None
    }


@router.get("/catalogs/{catalog_id}/extraction-status")
async def get_extraction_status(
    catalog_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    job = await extraction_service.get_extraction_status(org.id, catalog_id)
    if not job:
        raise APIException("NOT_FOUND", "No extraction job found for this catalog.", 404)
        
    return {
        "job_id": job.id,
        "catalog_id": job.catalog_id,
        "document_version_id": job.document_version_id,
        "status": job.status,
        "retry_count": job.retry_count,
        "error_details": job.error_details,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None
    }


@router.get("/catalogs/{catalog_id}")
async def get_catalog_details(
    catalog_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.get("/catalogs/{catalog_id}/versions")
async def get_catalog_version_history(
    catalog_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
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


@router.post("/catalogs/{catalog_id}/versions")
async def update_catalog_to_new_version(
    catalog_id: str,
    payload: Dict[str, Any],
    org: VendorOrganization = Depends(get_current_vendor_context),
    catalog_service: CatalogService = Depends(get_catalog_service)
):
    document_version_id = payload.get("document_version_id")
    if not document_version_id:
        raise APIException("BAD_REQUEST", "document_version_id is required.", 400)

    updated = await catalog_service.update_catalog_version(
        vendor_organization_id=org.id,
        catalog_id=catalog_id,
        document_version_id=document_version_id,
        title=payload.get("title"),
        description=payload.get("description"),
        catalog_year=payload.get("catalog_year")
    )
    return {
        "id": updated.id,
        "title": updated.title,
        "document_version_id": updated.document_version_id,
        "status": updated.status
    }


# ==========================================
# PHASE 3C: DRAFT LIFECYCLE
# ==========================================

from pydantic import BaseModel, Field

class DraftEditRequest(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=255)
    attributes: Dict[str, Any] = Field(default_factory=dict)

class DraftRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)

@router.get("/catalogs/{catalog_id}/drafts")
async def list_catalog_drafts(
    catalog_id: str,
    status: Optional[str] = Query(None),
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    drafts = await extraction_service.get_drafts_for_catalog(org.id, catalog_id, status)
    # Drafts is list of tuples (draft, ai_record)
    results = []
    for draft, record in drafts:
        results.append({
            "id": draft.id,
            "catalog_id": draft.catalog_id,
            "product_name": draft.product_name,
            "attributes": draft.attributes_json, # it's string, we can parse or return as is
            "status": draft.status,
            "rejection_reason": draft.rejection_reason,
            "created_at": draft.created_at.isoformat() if draft.created_at else None,
            "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
            "reviewed_at": draft.reviewed_at.isoformat() if draft.reviewed_at else None,
            "reviewed_by_user_id": draft.reviewed_by_user_id,
            "provenance": {
                "source_document_version_id": draft.document_version_id,
                "ai_extraction_record_id": record.id if record else None,
                "job_id": record.job_id if record else None
            }
        })
    return results

@router.get("/catalogs/drafts/{draft_id}")
async def get_single_draft(
    draft_id: str,
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    res = await extraction_service.get_draft_by_id(org.id, draft_id)
    if not res:
        raise APIException("NOT_FOUND", "Draft not found or you do not have access.", 404)
    draft, record = res
    return {
        "id": draft.id,
        "catalog_id": draft.catalog_id,
        "product_name": draft.product_name,
        "attributes": draft.attributes_json,
        "status": draft.status,
        "rejection_reason": draft.rejection_reason,
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
        "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
        "reviewed_at": draft.reviewed_at.isoformat() if draft.reviewed_at else None,
        "reviewed_by_user_id": draft.reviewed_by_user_id,
        "provenance": {
            "source_document_version_id": draft.document_version_id,
            "ai_extraction_record_id": record.id,
            "job_id": record.job_id
        }
    }

@router.patch("/catalogs/drafts/{draft_id}")
async def update_draft(
    draft_id: str,
    payload: DraftEditRequest,
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    updated_count = await extraction_service.update_draft(
        vendor_organization_id=org.id,
        draft_id=draft_id,
        product_name=payload.product_name,
        attributes=payload.attributes
    )
    if updated_count == 0:
        raise APIException("CONFLICT", "Draft is no longer editable or not found.", 409)
    return {"status": "success", "updated_fields": ["product_name", "attributes"]}

@router.post("/catalogs/{catalog_id}/items/manual")
async def add_manual_catalog_item(
    catalog_id: str,
    payload: DraftEditRequest,
    current_user: User = Depends(get_current_user),
    org: VendorOrganization = Depends(get_current_vendor_context),
    db: AsyncSession = Depends(get_db)
):
    from app.models.catalog import CatalogRecord
    from app.models.extraction import CatalogProductDraft
    from app.models.embedding import CatalogEmbeddingJob
    from sqlalchemy.future import select
    import json
    
    # 1. Fetch catalog to ensure it exists and get document_version_id
    stmt = select(CatalogRecord).where(CatalogRecord.id == catalog_id, CatalogRecord.vendor_organization_id == org.id)
    res = await db.execute(stmt)
    catalog = res.scalar_one_or_none()
    
    if not catalog:
        raise APIException("NOT_FOUND", "Catalog not found.", 404)
        
    # 2. Create the draft as PENDING for admin review
    draft = CatalogProductDraft(
        vendor_organization_id=org.id,
        catalog_id=catalog_id,
        document_version_id=catalog.document_version_id,
        product_name=payload.product_name,
        attributes_json=json.dumps(payload.attributes),
        status="PENDING",
        # reviewed_by_user_id=current_user.id, # Admins will review it
        # reviewed_at=func.now()
    )
    db.add(draft)
    await db.flush()
    
    # 3. Create embedding job
    job = CatalogEmbeddingJob(
        vendor_organization_id=org.id,
        catalog_product_draft_id=draft.id,
        status="PENDING"
    )
    db.add(job)
    await db.commit()
    
    return {"status": "success", "draft_id": draft.id, "job_id": job.id}

@router.post("/catalogs/drafts/{draft_id}/approve")
async def approve_draft(
    draft_id: str,
    current_user: User = Depends(get_current_user),
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    updated_count = await extraction_service.approve_draft(
        vendor_organization_id=org.id,
        draft_id=draft_id,
        user_id=current_user.id
    )
    if updated_count == 0:
        raise APIException("CONFLICT", "Draft is no longer editable or not found.", 409)
    return {"status": "success", "new_status": "APPROVED"}

@router.post("/catalogs/drafts/{draft_id}/reject")
async def reject_draft(
    draft_id: str,
    payload: DraftRejectRequest,
    current_user: User = Depends(get_current_user),
    org: VendorOrganization = Depends(get_current_vendor_context),
    extraction_service = Depends(get_extraction_service)
):
    updated_count = await extraction_service.reject_draft(
        vendor_organization_id=org.id,
        draft_id=draft_id,
        user_id=current_user.id,
        rejection_reason=payload.reason
    )
    if updated_count == 0:
        raise APIException("CONFLICT", "Draft is no longer editable or not found.", 409)
    return {"status": "success", "new_status": "REJECTED"}

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=50)

@router.post("/search")
async def search_catalog(
    payload: SemanticSearchRequest,
    org: VendorOrganization = Depends(get_current_vendor_context),
    db: AsyncSession = Depends(get_db)
):
    from app.services.ai.embedding import GeminiEmbeddingProvider
    from app.services.vector.qdrant import QdrantVectorSearchService
    from app.models.extraction import CatalogProductDraft
    from sqlalchemy.future import select
    from sqlalchemy import or_, func
    import json

    results = []
    try:
        provider = GeminiEmbeddingProvider()
        query_vector = await provider.generate_embedding(payload.query)
        vector_service = QdrantVectorSearchService()
        results = await vector_service.search_by_vector(
            query_vector=query_vector,
            limit=payload.limit,
            filter_metadata={"vendor_organization_id": org.id}
        )
    except Exception as e:
        results = []

    if results:
        draft_ids = [hit["id"] for hit in results]
        stmt = select(CatalogProductDraft).where(
            CatalogProductDraft.id.in_(draft_ids),
            CatalogProductDraft.vendor_organization_id == org.id,
            CatalogProductDraft.status == "APPROVED"
        )
        db_res = await db.execute(stmt)
        db_drafts = {draft.id: draft for draft in db_res.scalars().all()}
        
        hit_map = {hit["id"]: hit["score"] for hit in results}
        output = []
        for draft_id in draft_ids:
            draft = db_drafts.get(draft_id)
            if draft:
                output.append({
                    "id": draft.id,
                    "catalog_id": draft.catalog_id,
                    "product_name": draft.product_name,
                    "attributes": json.loads(draft.attributes_json) if draft.attributes_json else {},
                    "score": hit_map.get(draft.id, 0.0)
                })
        return {"results": output}

    # SQL Keyword Search Fallback
    terms = [t.strip() for t in payload.query.split() if len(t.strip()) >= 2]
    if not terms:
        return {"results": []}

    conditions = []
    for term in terms:
        like = f"%{term}%"
        conditions.append(
            or_(
                func.lower(CatalogProductDraft.product_name).like(func.lower(like)),
                func.lower(CatalogProductDraft.attributes_json).like(func.lower(like)),
            )
        )

    stmt = select(CatalogProductDraft).where(
        CatalogProductDraft.vendor_organization_id == org.id,
        CatalogProductDraft.status == "APPROVED",
        *conditions
    ).limit(payload.limit)
    db_res = await db.execute(stmt)
    db_drafts = list(db_res.scalars().all())

    output = []
    for draft in db_drafts:
        attrs = {}
        if draft.attributes_json:
            try:
                attrs = json.loads(draft.attributes_json)
            except Exception:
                pass
        output.append({
            "id": draft.id,
            "catalog_id": draft.catalog_id,
            "product_name": draft.product_name,
            "attributes": attrs,
            "score": 0.8
        })

    return {"results": output}
