"""
RecommendationRequest and RecommendationResult models.

Security:
  - Every record is strictly tenant-scoped (vendor_organization_id is NOT NULL).
  - Recommendation data is advisory only — these tables NEVER control purchasing state.
  - Results must be re-validated against current MySQL product state on read.
"""
import uuid
from sqlalchemy import String, Float, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.base import Base


class RecommendationRequest(Base):
    """Represents a single vendor matching/recommendation request."""
    __tablename__ = "recommendation_requests"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Tenant scope — always derived from server-side JWT, never from client
    vendor_organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("vendor_organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # The raw query text (treated as untrusted data, never as an instruction)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Gemini-normalized structured requirement — JSON string
    normalized_requirements_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        Enum(
            "PENDING", "PROCESSING", "COMPLETED", "FAILED",
            name="recommendation_request_status_enum"
        ),
        default="PENDING",
        index=True,
    )
    error_details: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RecommendationResult(Base):
    """
    A single matched product candidate within a RecommendationRequest.
    Advisory only — never authoritative for purchasing state.
    """
    __tablename__ = "recommendation_results"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    recommendation_request_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("recommendation_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Tenant scope carried per-result for fast validation
    vendor_organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("vendor_organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    draft_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_product_drafts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    catalog_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Composite scores — all between 0.0 and 1.0
    semantic_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    attribute_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # HIGH / MEDIUM / LOW
    confidence: Mapped[str] = mapped_column(String(16), nullable=False, default="LOW")

    match_reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    mismatch_reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
