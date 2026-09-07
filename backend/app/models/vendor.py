import uuid
from sqlalchemy import String, Enum, DateTime, ForeignKey, Boolean, Integer, Float, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.db.base import Base

class VendorOrganization(Base):
    __tablename__ = "vendor_organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_code: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    short_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    organization_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vendor_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vendor_group: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    msme_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    vendor_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gst_registration_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tds_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    other_regulatory_registrations: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    primary_contact_person: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contact_designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    alternate_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    head_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    head_designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    head_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    head_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    
    # Commercial Terms
    payment_terms: Mapped[str | None] = mapped_column(String(128), nullable=True)
    credit_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True, default="INR")
    freight_terms: Mapped[str | None] = mapped_column(String(128), nullable=True)
    delivery_terms: Mapped[str | None] = mapped_column(String(128), nullable=True)
    price_list_applicable: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rate_contract_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    contract_start_date: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contract_end_date: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Classification
    supply_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    primary_business_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    product_service_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    geographical_coverage: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supply_categories_list: Mapped[str | None] = mapped_column(Text, nullable=True) # JSON Array
    
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    state_province: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address_line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    
    business_registration_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tax_identification_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    
    has_active_legal_cases: Mapped[bool] = mapped_column(Boolean, default=False)
    legal_case_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Pre-Qualification & Declarations
    years_in_business: Mapped[int | None] = mapped_column(Integer, nullable=True)
    projects_completed_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    high_value_projects_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_service_base_jaipur: Mapped[bool] = mapped_column(Boolean, default=False)
    
    is_blacklisted: Mapped[bool] = mapped_column(Boolean, default=False)
    pending_litigation: Mapped[bool] = mapped_column(Boolean, default=False)
    not_debarred_declaration: Mapped[bool] = mapped_column(Boolean, default=False)
    
    status: Mapped[str] = mapped_column(
        Enum("DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "INACTIVE", name="vendor_status_enum"),
        default="DRAFT"
    )
    verification_status: Mapped[str] = mapped_column(
        Enum("UNVERIFIED", "VERIFIED", name="vendor_verification_enum"),
        default="UNVERIFIED"
    )

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    users: Mapped[list["User"]] = relationship("User", backref="vendor_organization")
    contacts: Mapped[list["VendorContact"]] = relationship("VendorContact", back_populates="vendor_organization", cascade="all, delete-orphan")
    bank_details: Mapped[list["VendorBankDetails"]] = relationship("VendorBankDetails", back_populates="vendor_organization", cascade="all, delete-orphan")
    projects: Mapped[list["VendorProjectHistory"]] = relationship("VendorProjectHistory", back_populates="vendor_organization", cascade="all, delete-orphan")
    financials: Mapped["VendorFinancials"] = relationship("VendorFinancials", back_populates="vendor_organization", uselist=False, cascade="all, delete-orphan")
    documents: Mapped[list["VendorDocument"]] = relationship("VendorDocument", back_populates="vendor_organization", cascade="all, delete-orphan")


class VendorContact(Base):
    __tablename__ = "vendor_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    
    contact_type: Mapped[str] = mapped_column(
        Enum("ORGANIZATION_HEAD", "AUTHORIZED_SIGNATORY", "PRIMARY_CONTACT", "FINANCE_CONTACT", "SALES_CONTACT", "TECHNICAL_CONTACT", "REGIONAL_HEAD", "STATE_HEAD", "OTHER", name="contact_type_enum"),
        default="PRIMARY_CONTACT"
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    vendor_organization: Mapped["VendorOrganization"] = relationship("VendorOrganization", back_populates="contacts")


class VendorBankDetails(Base):
    __tablename__ = "vendor_bank_details"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str] = mapped_column(String(64), nullable=False)
    ifsc_code: Mapped[str] = mapped_column(String(32), nullable=False)
    account_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    vendor_organization: Mapped["VendorOrganization"] = relationship("VendorOrganization", back_populates="bank_details")


class VendorProjectHistory(Base):
    __tablename__ = "vendor_project_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bed_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_300_plus_beds: Mapped[bool] = mapped_column(Boolean, default=False)
    project_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    project_duration: Mapped[str | None] = mapped_column(String(128), nullable=True)
    financial_year: Mapped[str | None] = mapped_column(String(32), nullable=True)
    scope_of_work: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    vendor_organization: Mapped["VendorOrganization"] = relationship("VendorOrganization", back_populates="projects")


class VendorFinancials(Base):
    __tablename__ = "vendor_financials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    turnover_fy1: Mapped[float | None] = mapped_column(Float, nullable=True) # e.g. FY 25-26
    turnover_fy2: Mapped[float | None] = mapped_column(Float, nullable=True) # e.g. FY 24-25
    turnover_fy3: Mapped[float | None] = mapped_column(Float, nullable=True) # e.g. FY 23-24
    
    infrastructure_base_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    vendor_organization: Mapped["VendorOrganization"] = relationship("VendorOrganization", back_populates="financials")


class VendorDocument(Base):
    __tablename__ = "vendor_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    document_type: Mapped[str] = mapped_column(
        Enum("PAN", "GST", "MSME", "DRUG_LICENSE", "FSSAI", "CANCELLED_CHEQUE", "BALANCE_SHEET", "PRODUCT_CATALOG", "COMPANY_PROFILE", "NON_DEBARMENT_DECLARATION", "OTHER", name="vendor_document_type_enum"),
        nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    vendor_organization: Mapped["VendorOrganization"] = relationship("VendorOrganization", back_populates="documents")
