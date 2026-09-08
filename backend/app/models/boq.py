import uuid
from sqlalchemy import String, DateTime, ForeignKey, Float, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.db.base import Base

class BOQ(Base):
    __tablename__ = "boqs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tender_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")  # DRAFT, PUBLISHED, LOCKED, EVALUATED, AWARDED, CANCELLED
    boq_type: Mapped[str] = mapped_column(String(32), default="COMMERCIAL")  # TECHNICAL, COMMERCIAL, TECHNOCOMMERCIAL
    
    published_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    target_audience: Mapped[str] = mapped_column(String(32), default="ALL_APPROVED")  # ALL_APPROVED, SELECTED_VENDORS
    allow_download: Mapped[bool] = mapped_column(Boolean, default=True)
    
    custom_columns_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # List of custom column names
    extracted_data_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # Full Gemini extraction of original BOQ
    document_version_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    items = relationship("BOQItem", back_populates="boq", cascade="all, delete-orphan", order_by="BOQItem.item_code")
    targets = relationship("BOQVendorTarget", back_populates="boq", cascade="all, delete-orphan")
    submissions = relationship("BOQSubmission", back_populates="boq", cascade="all, delete-orphan")


class BOQVendorTarget(Base):
    __tablename__ = "boq_vendor_targets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    boq_id: Mapped[str] = mapped_column(String(36), ForeignKey("boqs.id", ondelete="CASCADE"), nullable=False)
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    boq = relationship("BOQ", back_populates="targets")
    vendor_organization = relationship("VendorOrganization")


class BOQItem(Base):
    __tablename__ = "boq_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    boq_id: Mapped[str] = mapped_column(String(36), ForeignKey("boqs.id", ondelete="CASCADE"), nullable=False)
    
    item_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    item_name: Mapped[str] = mapped_column(String(500), nullable=False)
    specifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    uom: Mapped[str] = mapped_column(String(50), nullable=False, default="Nos")
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    attributes_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON dictionary for dynamic columns
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    boq = relationship("BOQ", back_populates="items")
    submission_items = relationship("BOQSubmissionItem", back_populates="boq_item", cascade="all, delete-orphan")


class BOQSubmission(Base):
    __tablename__ = "boq_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    boq_id: Mapped[str] = mapped_column(String(36), ForeignKey("boqs.id", ondelete="CASCADE"), nullable=False)
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")  # DRAFT, SUBMITTED
    submitted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submission_type: Mapped[str] = mapped_column(String(32), default="MANUAL")  # MANUAL, EXCEL_UPLOAD, PDF_UPLOAD
    document_version_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True)
    
    sub_total: Mapped[float] = mapped_column(Float, default=0.0)
    gst_percent: Mapped[float] = mapped_column(Float, default=18.0)
    gst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    grand_total: Mapped[float] = mapped_column(Float, default=0.0)
    negotiated_grand_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    payment_terms: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delivery_time: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warranty_terms: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tank_capacity_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    technical_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    technical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_data_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # Full Gemini extraction of vendor quote
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    boq = relationship("BOQ", back_populates="submissions")
    vendor_organization = relationship("VendorOrganization")
    items = relationship("BOQSubmissionItem", back_populates="submission", cascade="all, delete-orphan")


class BOQSubmissionItem(Base):
    __tablename__ = "boq_submission_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    submission_id: Mapped[str] = mapped_column(String(36), ForeignKey("boq_submissions.id", ondelete="CASCADE"), nullable=False)
    boq_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("boq_items.id", ondelete="CASCADE"), nullable=False)
    
    quoted_unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    negotiated_unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    negotiated_total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    make_model_quoted: Mapped[str | None] = mapped_column(String(255), nullable=True)
    technical_compliance: Mapped[str] = mapped_column(String(32), default="COMPLIANT")  # COMPLIANT, DEVIATION, NON_COMPLIANT
    vendor_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    attributes_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    submission = relationship("BOQSubmission", back_populates="items")
    boq_item = relationship("BOQItem", back_populates="submission_items")
