"""
Vendor Recommendation API — Phase 3E.

Endpoint: POST /api/v1/vendor/recommendations

Security:
  - Requires authenticated vendor context (get_current_vendor_context).
  - vendor_organization_id is derived exclusively from the server-side JWT,
    never from request body or query parameters.
  - Query text is validated and length-limited by Pydantic.
  - Response contains only advisory recommendations — no purchasing actions.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_vendor_context
from app.core.exceptions import APIException
from app.db.session import get_db
from app.models.user import User
from app.models.vendor import VendorOrganization

router = APIRouter()

_MAX_QUERY_LEN = 2_000


class RecommendationRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=_MAX_QUERY_LEN,
                       description="Natural-language procurement requirement")


@router.post("")
async def vendor_recommend(
    payload: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    org: VendorOrganization = Depends(get_current_vendor_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a procurement requirement and receive AI-assisted vendor product recommendations.

    Recommendations are advisory only. No procurement action is taken automatically.
    The caller (human) is responsible for the final sourcing decision.
    """
    from app.services.recommendation.service import RecommendationService

    service = RecommendationService(db)
    try:
        result = await service.recommend(
            vendor_organization_id=org.id,        # JWT-derived, never from body
            requested_by_user_id=current_user.id,
            query_text=payload.query,
        )
    except RuntimeError as exc:
        # Service-level failures (Qdrant unavailable, embedding failed, etc.)
        raise APIException(
            "SERVICE_UNAVAILABLE",
            "Recommendation service is currently unavailable. Please try again later.",
            503,
        ) from exc
    except Exception:
        raise APIException("INTERNAL_ERROR", "An unexpected error occurred.", 500)

    return result
