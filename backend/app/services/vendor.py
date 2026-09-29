import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vendor import VendorOrganization, VendorContact
from app.models.user import User
from app.core.exceptions import APIException

class VendorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_vendor_by_id(self, vendor_id: str) -> Optional[VendorOrganization]:
        stmt = select(VendorOrganization).options(
            selectinload(VendorOrganization.contacts),
            selectinload(VendorOrganization.bank_details),
            selectinload(VendorOrganization.financials),
            selectinload(VendorOrganization.projects)
        ).where(VendorOrganization.id == vendor_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_vendor_by_user_id(self, user_id: str) -> Optional[VendorOrganization]:
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user or not user.vendor_organization_id:
            return None
            
        return await self.get_vendor_by_id(user.vendor_organization_id)

    async def register_vendor(self, user: User, legal_name: str, organization_type: str) -> VendorOrganization:
        if user.vendor_organization_id:
            raise APIException("BAD_REQUEST", "User is already associated with a vendor organization.", 400)
            
        org = VendorOrganization(
            legal_name=legal_name,
            organization_type=organization_type,
            status="DRAFT",
            verification_status="UNVERIFIED"
        )
        self.db.add(org)
        await self.db.flush()
        
        user.vendor_organization_id = org.id
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def update_vendor_profile(self, org: VendorOrganization, data: dict) -> VendorOrganization:
        allowed_fields = {
            # Section 1: Identification
            "legal_name", "trade_name", "display_name", "short_name", "organization_type", 
            "vendor_category", "vendor_group", "vendor_type", "pan_number", "gstin",
            "gst_registration_type", "msme_registered", "tds_applicable", "other_regulatory_registrations",
            "business_registration_number", "tax_identification_number",
            # Section 2: Address & Contact
            "country", "state_province", "city", "address_line_1", "address_line_2", "postal_code",
            "website", "primary_email", "primary_phone", "alternate_phone", "alternate_email",
            "primary_contact_person", "contact_designation",
            # Section 3: Head of Organisation
            "head_name", "head_designation", "head_email", "head_phone",
            # Section 5: Commercial Terms
            "payment_terms", "credit_days", "currency", "freight_terms", "delivery_terms",
            "price_list_applicable", "rate_contract_applicable", "contract_start_date", "contract_end_date",
            # Section 6: Classification
            "supply_category", "primary_business_type", "product_service_type", "geographical_coverage", "supply_categories_list",
            # Section 7: Pre-Qualification & Declarations
            "years_in_business", "projects_completed_count", "high_value_projects_count", "high_value_projects_threshold_cr", "has_service_base_jaipur",
            "is_blacklisted", "pending_litigation", "not_debarred_declaration"
        }
        
        from app.core.validators import (
            clean_pan, clean_gstin, clean_pin_code, clean_phone
        )

        if "pan_number" in data and data["pan_number"]:
            data["pan_number"] = clean_pan(data["pan_number"])
        if "gstin" in data and data["gstin"]:
            data["gstin"] = clean_gstin(data["gstin"])
        if "postal_code" in data and data["postal_code"]:
            data["postal_code"] = clean_pin_code(data["postal_code"])
        if "primary_phone" in data and data["primary_phone"]:
            data["primary_phone"] = clean_phone(data["primary_phone"])
        if "alternate_phone" in data and data["alternate_phone"]:
            data["alternate_phone"] = clean_phone(data["alternate_phone"])
        if "head_phone" in data and data["head_phone"]:
            data["head_phone"] = clean_phone(data["head_phone"])

        for key, value in data.items():
            if key in allowed_fields:
                setattr(org, key, value)

        # Auto-sync primary contact to VendorContact table
        if org.primary_contact_person or org.primary_email:
            from app.models.vendor import VendorContact
            stmt = select(VendorContact).where(
                VendorContact.vendor_organization_id == org.id,
                VendorContact.is_primary == True
            )
            res = await self.db.execute(stmt)
            p_contact = res.scalar_one_or_none()
            if not p_contact:
                p_contact = VendorContact(vendor_organization_id=org.id, is_primary=True)
                self.db.add(p_contact)
            p_contact.full_name = org.primary_contact_person or org.legal_name
            p_contact.designation = org.contact_designation or "Primary Contact"
            p_contact.email = org.primary_email or ""
            p_contact.phone = org.primary_phone or ""
            p_contact.contact_type = "PRIMARY_CONTACT"

        # Auto-sync head of organization to VendorContact table
        if org.head_name or org.head_email:
            from app.models.vendor import VendorContact
            stmt = select(VendorContact).where(
                VendorContact.vendor_organization_id == org.id,
                VendorContact.contact_type == "ORGANIZATION_HEAD"
            )
            res = await self.db.execute(stmt)
            h_contact = res.scalar_one_or_none()
            if not h_contact:
                h_contact = VendorContact(vendor_organization_id=org.id, is_primary=False)
                self.db.add(h_contact)
            h_contact.full_name = org.head_name or "Head of Org"
            h_contact.designation = org.head_designation or "Managing Director"
            h_contact.email = org.head_email or ""
            h_contact.phone = org.head_phone or ""
            h_contact.contact_type = "ORGANIZATION_HEAD"

        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def add_contact(self, org_id: str, data: dict) -> VendorContact:
        contact = VendorContact(vendor_organization_id=org_id, **data)
        self.db.add(contact)
        await self.db.commit()
        await self.db.refresh(contact)
        return contact
        
    async def get_contacts(self, org_id: str) -> List[VendorContact]:
        stmt = select(VendorContact).where(VendorContact.vendor_organization_id == org_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_contact(self, org_id: str, contact_id: str) -> bool:
        stmt = select(VendorContact).where(VendorContact.id == contact_id, VendorContact.vendor_organization_id == org_id)
        result = await self.db.execute(stmt)
        contact = result.scalar_one_or_none()
        
        if not contact:
            return False
            
        await self.db.delete(contact)
        await self.db.commit()
        return True

    async def submit_for_review(self, org: VendorOrganization) -> VendorOrganization:
        if org.status == "APPROVED":
            raise APIException("BAD_REQUEST", "Approved profiles cannot be re-submitted.", 400)
        
        from app.models.document import Document
        from app.models.vendor import VendorBankDetails

        from app.core.validators import (
            is_valid_pan, is_valid_gstin, validate_gstin_matches_pan,
            is_valid_pin_code, is_valid_phone, is_valid_ifsc
        )

        missing = []
        if not org.legal_name or not str(org.legal_name).strip():
            missing.append("Legal Name of Company")

        # PAN validation
        if not org.pan_number or not str(org.pan_number).strip():
            missing.append("PAN Number")
        elif not is_valid_pan(org.pan_number):
            missing.append(f"Valid 10-character PAN (Expected format: ABCDE1234F, provided: '{org.pan_number}')")

        # GSTIN validation
        if not org.gstin or not str(org.gstin).strip():
            missing.append("GSTIN")
        elif not is_valid_gstin(org.gstin):
            missing.append(f"Valid 15-character GSTIN (Expected format: 08ABCDE1234F1Z5, provided: '{org.gstin}')")
        elif is_valid_pan(org.pan_number):
            matches, ext_pan = validate_gstin_matches_pan(org.gstin, org.pan_number)
            if not matches:
                missing.append(f"GSTIN matching company PAN (GSTIN contains PAN '{ext_pan}', but your PAN is '{org.pan_number}')")

        if not org.address_line_1 or not str(org.address_line_1).strip():
            missing.append("Registered Address Line 1")
        if not org.city or not str(org.city).strip():
            missing.append("City")
        if not org.state_province or not str(org.state_province).strip():
            missing.append("State")

        # PIN Code validation
        if not org.postal_code or not str(org.postal_code).strip():
            missing.append("PIN Code")
        elif not is_valid_pin_code(org.postal_code):
            missing.append(f"Valid 6-digit PIN Code (e.g. 302022, provided: '{org.postal_code}')")

        if not org.primary_contact_person or not str(org.primary_contact_person).strip():
            missing.append("Primary Contact Person")

        # Phone validation
        if not org.primary_phone or not str(org.primary_phone).strip():
            missing.append("Primary Contact Mobile Number")
        elif not is_valid_phone(org.primary_phone):
            missing.append(f"Valid 10-digit Primary Contact Mobile Number (provided: '{org.primary_phone}')")

        if not org.primary_email or not str(org.primary_email).strip():
            missing.append("Primary Contact Email")
        if not org.head_name or not str(org.head_name).strip():
            missing.append("Head of Organisation Name")

        # Check bank details & IFSC validation
        bank_stmt = select(VendorBankDetails).where(VendorBankDetails.vendor_organization_id == org.id)
        res = await self.db.execute(bank_stmt)
        bank = res.scalar_one_or_none()
        if not bank or not bank.bank_name or not bank.account_number or not bank.ifsc_code:
            missing.append("Bank Details (Bank Name, Account Number, IFSC Code)")
        elif not is_valid_ifsc(bank.ifsc_code):
            missing.append(f"Valid 11-character Bank IFSC Code (e.g. SBIN0000691, provided: '{bank.ifsc_code}')")

        # Check required documents
        doc_stmt = select(Document.document_type).where(Document.vendor_organization_id == org.id)
        doc_res = await self.db.execute(doc_stmt)
        uploaded_types = set(doc_res.scalars().all())

        required_docs = {
            "PAN": "PAN Card Copy",
            "GST": "GST Registration Certificate",
            "CANCELLED_CHEQUE": "Cancelled Cheque / Bank Letter",
            "BALANCE_SHEET": "Audited Balance Sheet",
            "NON_DEBARMENT_DECLARATION": "Non-Debarment Declaration"
        }

        for doc_code, doc_name in required_docs.items():
            if doc_code not in uploaded_types:
                missing.append(f"Document: {doc_name}")

        if missing:
            raise APIException(
                "BAD_REQUEST", 
                f"Cannot submit profile. Please address: {', '.join(missing)}", 
                400
            )

        org.status = "SUBMITTED"
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def upsert_bank_details(self, org_id: str, data: dict) -> None:
        from app.models.vendor import VendorBankDetails
        from app.core.validators import clean_ifsc
        
        stmt = select(VendorBankDetails).where(VendorBankDetails.vendor_organization_id == org_id)
        res = await self.db.execute(stmt)
        bank = res.scalar_one_or_none()
        
        if not bank:
            bank = VendorBankDetails(vendor_organization_id=org_id)
            self.db.add(bank)
            
        allowed = {"bank_name", "branch_name", "account_name", "account_number", "ifsc_code", "account_type"}
        for k, v in data.items():
            if k in allowed:
                if k == "ifsc_code":
                    v = clean_ifsc(v)
                setattr(bank, k, v)
        await self.db.commit()

    async def upsert_financials(self, org_id: str, data: dict) -> None:
        from app.models.vendor import VendorFinancials
        stmt = select(VendorFinancials).where(VendorFinancials.vendor_organization_id == org_id)
        res = await self.db.execute(stmt)
        fin = res.scalar_one_or_none()
        
        if not fin:
            fin = VendorFinancials(vendor_organization_id=org_id)
            self.db.add(fin)
            
        allowed = {"turnover_fy1", "turnover_fy2", "turnover_fy3", "infrastructure_base_details"}
        for k, v in data.items():
            if k in allowed:
                val = v
                if k in ["turnover_fy1", "turnover_fy2", "turnover_fy3"]:
                    if val == "" or val is None:
                        val = None
                    else:
                        try:
                            val = float(val)
                        except (ValueError, TypeError):
                            val = None
                setattr(fin, k, val)
        await self.db.commit()

    async def upsert_projects(self, org_id: str, projects_list: list) -> None:
        from app.models.vendor import VendorProjectHistory
        from sqlalchemy import delete
        
        await self.db.execute(delete(VendorProjectHistory).where(VendorProjectHistory.vendor_organization_id == org_id))
        
        for p in projects_list:
            if p.get("hospital_name") and str(p.get("hospital_name")).strip():
                bed_cnt = p.get("bed_count")
                if bed_cnt == "" or bed_cnt is None:
                    bed_cnt = None
                else:
                    try:
                        bed_cnt = int(bed_cnt)
                    except (ValueError, TypeError):
                        bed_cnt = None

                p_cost = p.get("project_cost")
                if p_cost == "" or p_cost is None:
                    p_cost = None
                else:
                    try:
                        p_cost = float(p_cost)
                    except (ValueError, TypeError):
                        p_cost = None

                proj = VendorProjectHistory(
                    vendor_organization_id=org_id,
                    hospital_name=str(p.get("hospital_name")).strip(),
                    bed_count=bed_cnt,
                    is_300_plus_beds=bool(p.get("is_300_plus_beds", False)),
                    project_cost=p_cost,
                    project_duration=p.get("project_duration"),
                    financial_year=p.get("financial_year"),
                    scope_of_work=p.get("scope_of_work")
                )
                self.db.add(proj)
        await self.db.commit()
