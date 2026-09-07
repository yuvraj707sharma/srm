import uuid
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.base import Base

class CatalogExtractionJob(Base):
    __tablename__ = "catalog_extraction_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_records.id", ondelete="CASCADE"), nullable=False, index=True)
    document_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    status: Mapped[str] = mapped_column(Enum("PENDING", "PROCESSING", "COMPLETED", "FAILED", name="extraction_job_status_enum"), default="PENDING", index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class CatalogProductDraft(Base):
    __tablename__ = "catalog_product_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_records.id", ondelete="CASCADE"), nullable=False, index=True)
    document_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    attributes_json: Mapped[str | None] = mapped_column(Text, nullable=True) # Stored as JSON string
    
    status: Mapped[str] = mapped_column(Enum("NEEDS_REVIEW", "APPROVED", "REJECTED", name="product_draft_status_enum"), default="NEEDS_REVIEW", index=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

class AIExtractionRecord(Base):
    __tablename__ = "ai_extraction_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_extraction_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    product_draft_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("catalog_product_drafts.id", ondelete="CASCADE"), nullable=True, index=True)
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_records.id", ondelete="CASCADE"), nullable=False, index=True)
    document_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    raw_json_snippet: Mapped[str] = mapped_column(Text, nullable=False)
    model_provider_info: Mapped[str | None] = mapped_column(String(128), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
