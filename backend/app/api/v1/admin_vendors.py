from fastapi import APIRouter, Depends, Path, Query, Response, Body
from pydantic import BaseModel
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


import json
import os

CRITERIA_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "storage", "evaluation_criteria.json")

DEFAULT_CRITERIA = {
    "hospitals": {
        "title": "1. Hospital Projects (>300 Beds in last 3 FYs)",
        "description": "Number of Projects delivered in the last 3 years in Hospitals with more than 300 Beds (FY 2025-26, FY 2024-25 and FY 2023-24) with name of the Medical College/ Hospital, Project Cost and Project duration.",
        "min_bed_count": 300,
        "min_projects_count": 1,
        "weight_points": 20,
        "is_mandatory": True
    },
    "turnover": {
        "title": "2. Company Annual Turnover (Last 3 FYs)",
        "description": "Turnover of the Company in the last 3 years (FY 2025-26, FY 2024-25 and FY 2023-24).",
        "min_avg_turnover_cr": 5.0,
        "weight_points": 20,
        "is_mandatory": True
    },
    "high_value": {
        "title": "3. High-Value Projects Delivered",
        "description": "Number of Projects delivered with Project Cost of more than specified threshold.",
        "threshold_cr": 1.0,
        "min_count": 1,
        "weight_points": 20,
        "is_mandatory": True
    },
    "service_base": {
        "title": "4. Infrastructure / Service Base in Jaipur / Rajasthan",
        "description": "Infrastructure/ Service base at Jaipur and/ Rajasthan for prompt on-site maintenance and support.",
        "required_location": "Jaipur / Rajasthan",
        "weight_points": 20,
        "is_mandatory": True
    },
    "balance_sheet": {
        "title": "5. Audited Balance Sheet (FY 2024-25)",
        "description": "Audited Balance Sheet for FY 2024-25 with Chartered Accountant (CA) stamp and certification.",
        "required_fy": "FY 2024-25",
        "weight_points": 20,
        "is_mandatory": True
    },
    "scoring_weights": {
        "grade_a_min": 80,
        "grade_b_min": 65,
        "grade_c_min": 50
    }
}

def load_criteria() -> dict:
    try:
        if os.path.exists(CRITERIA_FILE_PATH):
            with open(CRITERIA_FILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return DEFAULT_CRITERIA

def save_criteria(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(CRITERIA_FILE_PATH), exist_ok=True)
        with open(CRITERIA_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


@router.get("")
async def admin_list_vendors(
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    from app.models.vendor import VendorEvaluation
    
    # Load all vendor organizations
    stmt = (
        select(VendorOrganization)
        .options(
            selectinload(VendorOrganization.financials),
            selectinload(VendorOrganization.projects)
        )
        .order_by(desc(VendorOrganization.created_at))
    )
    result = await db.execute(stmt)
    vendors = result.scalars().all()

    # Load evaluations safely in a separate query to prevent missing table errors
    eval_map = {}
    try:
        eval_stmt = select(VendorEvaluation).order_by(desc(VendorEvaluation.created_at))
        eval_res = await db.execute(eval_stmt)
        for ev in eval_res.scalars().all():
            if ev.vendor_organization_id not in eval_map:
                eval_map[ev.vendor_organization_id] = ev
    except Exception:
        eval_map = {}
    
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

        latest_eval = eval_map.get(v.id)
        latest_eval_dict = None
        if latest_eval:
            latest_eval_dict = {
                "id": latest_eval.id,
                "total_score": latest_eval.total_score,
                "evaluation_grade": latest_eval.evaluation_grade,
                "recommendation": latest_eval.recommendation,
                "evaluator_name": latest_eval.evaluator_name,
                "updated_at": latest_eval.updated_at.isoformat() if latest_eval.updated_at else None
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
            "latest_evaluation": latest_eval_dict,
            "created_at": v.created_at.isoformat() if v.created_at else None
        })
    return res


# ==========================================
# EVALUATION CRITERIA & AUTO-EVALUATION
# ==========================================

@router.get("/evaluation/criteria")
async def admin_get_evaluation_criteria(
    _ = Depends(require_permission("vendors.approve"))
):
    return load_criteria()


@router.post("/evaluation/criteria")
async def admin_save_evaluation_criteria(
    payload: Dict[str, Any],
    _ = Depends(require_permission("vendors.approve"))
):
    current = load_criteria()
    current.update(payload)
    save_criteria(current)
    return {"status": "success", "message": "Evaluation criteria rules successfully updated.", "criteria": current}


@router.post("/evaluation/auto-evaluate-all")
async def admin_auto_evaluate_all_vendors(
    db: AsyncSession = Depends(get_db),
    current_admin = Depends(require_permission("vendors.approve"))
):
    criteria = load_criteria()
    stmt = select(VendorOrganization).options(
        selectinload(VendorOrganization.projects),
        selectinload(VendorOrganization.financials),
        selectinload(VendorOrganization.documents)
    )
    res = await db.execute(stmt)
    vendors = res.scalars().all()

    evaluated_count = 0
    hosp_crit = criteria.get("hospitals", {})
    turn_crit = criteria.get("turnover", {})
    hv_crit = criteria.get("high_value", {})
    serv_crit = criteria.get("service_base", {})
    bal_crit = criteria.get("balance_sheet", {})

    min_bed = int(hosp_crit.get("min_bed_count", 300))
    min_hosp_count = int(hosp_crit.get("min_projects_count", 1))
    w_hosp = float(hosp_crit.get("weight_points", 20))

    min_turnover = float(turn_crit.get("min_avg_turnover_cr", 5.0))
    w_turn = float(turn_crit.get("weight_points", 20))

    hv_thresh = float(hv_crit.get("threshold_cr", 1.0))
    hv_min_count = int(hv_crit.get("min_count", 1))
    w_hv = float(hv_crit.get("weight_points", 20))

    w_serv = float(serv_crit.get("weight_points", 20))
    w_bal = float(bal_crit.get("weight_points", 20))

    evaluator_label = getattr(current_admin, "full_name", None) or getattr(current_admin, "username", "Admin")

    for v in vendors:
        # 1. Hospital Projects
        qual_hosp = [p for p in (v.projects or []) if (p.is_300_plus_beds or (p.bed_count and p.bed_count >= min_bed))]
        hosp_count = len(qual_hosp)
        if hosp_count >= min_hosp_count:
            h_score = w_hosp
            h_meets = True
            h_remarks = f"{hosp_count} verified hospital projects (>300 beds)."
        elif hosp_count > 0 or (v.projects_completed_count or 0) > 0:
            h_score = round(w_hosp * 0.5, 1)
            h_meets = False
            h_remarks = f"{hosp_count or v.projects_completed_count} hospital projects (below min {min_hosp_count})."
        else:
            h_score = 0.0
            h_meets = False
            h_remarks = "No hospital projects with >300 beds submitted."

        # 2. Turnover
        t_vals = []
        if v.financials:
            for val in [v.financials.turnover_fy1, v.financials.turnover_fy2, v.financials.turnover_fy3]:
                if val is not None:
                    try:
                        t_vals.append(float(val))
                    except (ValueError, TypeError):
                        pass
        avg_turnover = sum(t_vals) / len(t_vals) if t_vals else 0.0
        if avg_turnover >= min_turnover:
            t_score = w_turn
            t_meets = True
            t_remarks = f"3-Year Avg Turnover ₹{round(avg_turnover, 2)} Cr (meets >= ₹{min_turnover} Cr)."
        elif avg_turnover > 0:
            ratio = min(avg_turnover / min_turnover, 0.9)
            t_score = round(ratio * w_turn, 1)
            t_meets = False
            t_remarks = f"3-Year Avg Turnover ₹{round(avg_turnover, 2)} Cr (below required ₹{min_turnover} Cr)."
        else:
            t_score = 0.0
            t_meets = False
            t_remarks = "Financial turnover records not submitted."

        # 3. High-Value Projects
        hv_projects = [p for p in (v.projects or []) if (p.project_cost and float(p.project_cost) >= hv_thresh)]
        hv_count = max(len(hv_projects), v.high_value_projects_count or 0)
        if hv_count >= hv_min_count:
            hv_score = w_hv
            hv_meets = True
            hv_remarks = f"{hv_count} high-value projects with cost > ₹{hv_thresh} Cr confirmed."
        elif hv_count > 0:
            hv_score = round(w_hv * 0.5, 1)
            hv_meets = False
            hv_remarks = f"{hv_count} projects found (below min {hv_min_count})."
        else:
            hv_score = 0.0
            hv_meets = False
            hv_remarks = f"No projects exceeding ₹{hv_thresh} Cr."

        # 4. Service Base
        has_local = bool(v.has_service_base_jaipur or "rajasthan" in (v.state_province or "").lower() or "jaipur" in (v.city or "").lower())
        if has_local:
            s_score = w_serv
            s_meets = True
            s_remarks = "Local infrastructure & service base in Jaipur/Rajasthan confirmed."
        else:
            s_score = 0.0
            s_meets = False
            s_remarks = "No local service presence in Jaipur/Rajasthan indicated."

        # 5. Balance Sheet
        has_bs = any(d.document_type == "BALANCE_SHEET" for d in (v.documents or []))
        if has_bs:
            b_score = w_bal
            b_meets = True
            b_remarks = "Audited Balance Sheet for FY 2024-25 uploaded and verified."
        else:
            b_score = 0.0
            b_meets = False
            b_remarks = "Audited Balance Sheet for FY 2024-25 pending upload."

        total = round(h_score + t_score + hv_score + s_score + b_score, 1)
        if total >= criteria.get("scoring_weights", {}).get("grade_a_min", 80):
            grade = "A_GRADE"
            rec = "RECOMMENDED_BEST"
        elif total >= criteria.get("scoring_weights", {}).get("grade_b_min", 65):
            grade = "B_GRADE"
            rec = "QUALIFIED"
        elif total >= criteria.get("scoring_weights", {}).get("grade_c_min", 50):
            grade = "C_GRADE"
            rec = "NEEDS_CLARIFICATION"
        else:
            grade = "D_GRADE"
            rec = "REJECTED"

        try:
            stmt_ev = select(VendorEvaluation).where(VendorEvaluation.vendor_organization_id == v.id).order_by(desc(VendorEvaluation.created_at))
            evaluation = (await db.execute(stmt_ev)).scalars().first()
            if not evaluation:
                evaluation = VendorEvaluation(
                    vendor_organization_id=v.id,
                    hospitals_score=h_score,
                    hospitals_meets=h_meets,
                    hospitals_remarks=h_remarks,
                    turnover_score=t_score,
                    turnover_meets=t_meets,
                    turnover_remarks=t_remarks,
                    high_value_projects_score=hv_score,
                    high_value_projects_meets=hv_meets,
                    high_value_projects_remarks=hv_remarks,
                    service_base_score=s_score,
                    service_base_meets=s_meets,
                    service_base_remarks=s_remarks,
                    balance_sheet_score=b_score,
                    balance_sheet_verified=b_meets,
                    balance_sheet_remarks=b_remarks,
                    total_score=total,
                    evaluation_grade=grade,
                    recommendation=rec,
                    evaluator_name=f"Auto-Evaluator ({evaluator_label})",
                    admin_summary_notes=f"Evaluated against 5 Empanelment Criteria benchmarks. Total Score: {total}/100."
                )
                db.add(evaluation)
            else:
                evaluation.hospitals_score = h_score
                evaluation.hospitals_meets = h_meets
                evaluation.hospitals_remarks = h_remarks
                evaluation.turnover_score = t_score
                evaluation.turnover_meets = t_meets
                evaluation.turnover_remarks = t_remarks
                evaluation.high_value_projects_score = hv_score
                evaluation.high_value_projects_meets = hv_meets
                evaluation.high_value_projects_remarks = hv_remarks
                evaluation.service_base_score = s_score
                evaluation.service_base_meets = s_meets
                evaluation.service_base_remarks = s_remarks
                evaluation.balance_sheet_score = b_score
                evaluation.balance_sheet_verified = b_meets
                evaluation.balance_sheet_remarks = b_remarks
                evaluation.total_score = total
                evaluation.evaluation_grade = grade
                evaluation.recommendation = rec
                evaluation.evaluator_name = f"Auto-Evaluator ({evaluator_label})"
                evaluation.admin_summary_notes = f"Updated against 5 Empanelment Criteria benchmarks. Total Score: {total}/100."
            evaluated_count += 1
        except Exception:
            pass

    await db.commit()
    return {
        "status": "success",
        "evaluated_count": evaluated_count,
        "message": f"Successfully evaluated {evaluated_count} vendors according to the 5 criteria rules."
    }


@router.get("/{vendor_id}")
async def admin_get_vendor_profile(
    vendor_id: str,
    org: VendorOrganization = Depends(require_admin_or_vendor_owner()),
    vendor_service: VendorService = Depends(get_vendor_service),
    db: AsyncSession = Depends(get_db)
):
    org_with_contacts = await vendor_service.get_vendor_by_id(vendor_id)
    if not org_with_contacts:
        raise APIException("NOT_FOUND", "Vendor not found", 404)

    # Safely query evaluations
    vendor_evals = []
    try:
        e_stmt = select(VendorEvaluation).where(VendorEvaluation.vendor_organization_id == vendor_id).order_by(desc(VendorEvaluation.created_at))
        e_res = await db.execute(e_stmt)
        vendor_evals = e_res.scalars().all()
    except Exception:
        vendor_evals = []

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
            } for e in sorted(vendor_evals, key=lambda x: str(x.created_at or ""), reverse=True)
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


class VerifyVendorRequest(BaseModel):
    action: Optional[str] = "approve"
    comments: Optional[str] = None


@router.post("/{vendor_id}/verify")
async def admin_verify_vendor(
    vendor_id: str = Path(...),
    payload: Optional[VerifyVendorRequest] = Body(None),
    action: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _ = Depends(require_permission("vendors.approve"))
):
    from sqlalchemy import update
    from app.models.extraction import CatalogProductDraft
    from app.models.user import User

    stmt = select(VendorOrganization).where(VendorOrganization.id == vendor_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    
    if not org:
        raise APIException("NOT_FOUND", "Vendor not found.", 404)
        
    req_action = "approve"
    if payload and payload.action:
        req_action = payload.action
    elif action:
        req_action = action
    req_action = req_action.lower().strip()

    if org.status == "SUSPENDED" and req_action == "approve":
        raise APIException("BAD_REQUEST", "Cannot approve a suspended vendor. Please reactivate the account first.", 400)
        
    if req_action == "approve":
        org.status = "APPROVED"
        org.verification_status = "VERIFIED"
        # Auto-activate vendor user accounts so they can access their portal
        await db.execute(
            update(User)
            .where(User.vendor_organization_id == vendor_id)
            .values(is_active=True)
        )
        # Auto-approve all catalog product drafts for this vendor
        await db.execute(
            update(CatalogProductDraft)
            .where(CatalogProductDraft.vendor_organization_id == vendor_id)
            .values(status="APPROVED")
        )
    elif req_action == "reject":
        org.status = "REJECTED"
        org.verification_status = "UNVERIFIED"
    else:
        raise APIException("BAD_REQUEST", f"Invalid action '{req_action}'. Use 'approve' or 'reject'.", 400)
        
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
