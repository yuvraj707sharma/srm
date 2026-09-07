import uuid
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.base import Base

class CatalogEmbeddingJob(Base):
    __tablename__ = "catalog_embedding_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_records.id", ondelete="CASCADE"), nullable=False, index=True)
    draft_id: Mapped[str] = mapped_column(String(36), ForeignKey("catalog_product_drafts.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    
    status: Mapped[str] = mapped_column(Enum("PENDING", "PROCESSING", "COMPLETED", "FAILED", name="embedding_job_status_enum"), default="PENDING", index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
