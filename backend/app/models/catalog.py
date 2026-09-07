import uuid
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.base import Base

class CatalogRecord(Base):
    __tablename__ = "catalog_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    catalog_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    
    document_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="RESTRICT"), nullable=False)
    
    status: Mapped[str] = mapped_column(Enum("ACTIVE", "ARCHIVED", "DELETED", name="catalog_status_enum"), default="ACTIVE")
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
