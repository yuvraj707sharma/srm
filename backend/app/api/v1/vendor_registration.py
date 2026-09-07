from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.vendor import VendorOrganization, VendorBankDetails, VendorProjectHistory, VendorFinancials

router = APIRouter()

class MasterDataUpdate(BaseModel):
    legal_name: str
    trade_name: Optional[str] = None
    organization_type: Optional[str] = None
    vendor_category: Optional[str] = None
    vendor_group: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    msme_registered: bool = False
    
    country: Optional[str] = None
    state_province: Optional[str] = None
    city: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    postal_code: Optional[str] = None
    
    website: Optional[str] = None
    primary_phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    
    payment_terms: Optional[str] = None
    credit_days: Optional[int] = None
    currency: Optional[str] = "INR"
    freight_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    
    supply_category: Optional[str] = None
    primary_business_type: Optional[str] = None
    product_service_type: Optional[str] = None
    
    has_active_legal_cases: bool = False
    legal_case_details: Optional[str] = None

class VendorContactAdd(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_type: str

class BankDetailsUpdate(BaseModel):
    bank_name: str
    branch_name: Optional[str] = None
    account_name: str
    account_number: str
    ifsc_code: str
    account_type: Optional[str] = None

class ProjectHistoryAdd(BaseModel):
    hospital_name: str
    is_300_plus_beds: bool = False
    project_cost: Optional[float] = None
    project_duration: Optional[str] = None
    financial_year: Optional[str] = None

class FinancialsUpdate(BaseModel):
    turnover_fy1: Optional[float] = None
    turnover_fy2: Optional[float] = None
    turnover_fy3: Optional[float] = None
    infrastructure_base_details: Optional[str] = None


@router.put("/master")
async def update_master_data(
    req: MasterDataUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.vendor_organization_id:
        raise HTTPException(status_code=400, detail="User is not associated with a vendor organization.")
        
    stmt = select(VendorOrganization).where(VendorOrganization.id == current_user.vendor_organization_id)
    res = await db.execute(stmt)
    vendor = res.scalar_one_or_none()
    
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor organization not found.")
        
    for key, value in req.dict(exclude_unset=True).items():
        setattr(vendor, key, value)
        
    await db.commit()
    return {"status": "success"}

@router.put("/bank")
async def update_bank_details(
    req: BankDetailsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.vendor_organization_id:
        raise HTTPException(status_code=400, detail="User is not associated with a vendor organization.")
        
    stmt = select(VendorBankDetails).where(VendorBankDetails.vendor_organization_id == current_user.vendor_organization_id)
    res = await db.execute(stmt)
    bank = res.scalar_one_or_none()
    
    if not bank:
        bank = VendorBankDetails(vendor_organization_id=current_user.vendor_organization_id, **req.dict())
        db.add(bank)
    else:
        for key, value in req.dict(exclude_unset=True).items():
            setattr(bank, key, value)
            
    await db.commit()
    return {"status": "success"}

@router.post("/projects")
async def add_project_history(
    req: ProjectHistoryAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.vendor_organization_id:
        raise HTTPException(status_code=400, detail="User is not associated with a vendor organization.")
        
    project = VendorProjectHistory(vendor_organization_id=current_user.vendor_organization_id, **req.dict())
    db.add(project)
    await db.commit()
    return {"status": "success", "id": project.id}

@router.put("/financials")
async def update_financials(
    req: FinancialsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.vendor_organization_id:
        raise HTTPException(status_code=400, detail="User is not associated with a vendor organization.")
        
    stmt = select(VendorFinancials).where(VendorFinancials.vendor_organization_id == current_user.vendor_organization_id)
    res = await db.execute(stmt)
    fin = res.scalar_one_or_none()
    
    if not fin:
        fin = VendorFinancials(vendor_organization_id=current_user.vendor_organization_id, **req.dict())
        db.add(fin)
    else:
        for key, value in req.dict(exclude_unset=True).items():
            setattr(fin, key, value)
            
    await db.commit()
    return {"status": "success"}

@router.put("/contacts")
async def add_vendor_contacts(
    contacts: list[VendorContactAdd],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.vendor_organization_id:
        raise HTTPException(status_code=400, detail="User is not associated with a vendor organization.")
        
    from app.models.vendor import VendorContact
    
    # Delete existing contacts of these types to replace them, or just add
    # For now, we just add them
    for contact in contacts:
        new_contact = VendorContact(
            vendor_organization_id=current_user.vendor_organization_id,
            **contact.dict()
        )
        db.add(new_contact)
        
    await db.commit()
    return {"status": "success"}
