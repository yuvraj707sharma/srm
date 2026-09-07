"""
Admin Recommendation API — Phase 3E.

Endpoint: POST /api/v1/admin/recommendations

Security:
  - Requires admin permission ("vendors.read").
  - An optional vendor_organization_id filter is server-validated —
    the admin cannot receive unauthenticated access to arbitrary tenant data,
    but may scope queries to a specific vendor organization.
  - A normal vendor JWT cannot access this endpoint.
  - No purchasing actions are taken.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import require_permission
from app.core.exceptions import APIException
from app.db.session import get_db
from app.models.vendor import VendorOrganization

router = APIRouter()

_MAX_QUERY_LEN = 2_000


class AdminRecommendationRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=_MAX_QUERY_LEN)
    vendor_organization_id: Optional[str] = Field(
        None, max_length=36,
        description=(
            "Optional: scope recommendations to a specific vendor. "
            "Server-validated — must be a real organization."
        ),
    )


@router.post("")
async def admin_recommend(
    payload: AdminRecommendationRequest,
    db: AsyncSession = Depends(get_db),
    admin_user=Depends(require_permission("vendors.read_all")),
):
    """
    Admin-scoped recommendation engine.
    Optionally filter by a specific vendor organization.
    Advisory only — no procurement actions are taken.
    """
    from app.services.recommendation.service import RecommendationService

    # If a vendor org filter is requested, validate it exists
    target_vendor_id: Optional[str] = None
    if payload.vendor_organization_id:
        stmt = select(VendorOrganization).where(
            VendorOrganization.id == payload.vendor_organization_id
        )
        res = await db.execute(stmt)
        org = res.scalar_one_or_none()
        if not org:
            raise APIException("NOT_FOUND", "Vendor organization not found.", 404)
        target_vendor_id = org.id

    if not target_vendor_id:
        # Without a vendor filter the Qdrant search would be cross-tenant.
        # Require explicit vendor scope for safety.
        raise APIException(
            "BAD_REQUEST",
            "vendor_organization_id is required for admin recommendations "
            "to prevent unintended cross-tenant data exposure.",
            400,
        )

    service = RecommendationService(db)
    try:
        result = await service.recommend(
            vendor_organization_id=target_vendor_id,
            requested_by_user_id=admin_user.id,
            query_text=payload.query,
        )
    except RuntimeError as exc:
        raise APIException(
            "SERVICE_UNAVAILABLE",
            "Recommendation service is currently unavailable.",
            503,
        ) from exc
    except Exception:
        raise APIException("INTERNAL_ERROR", "An unexpected error occurred.", 500)

    return result
