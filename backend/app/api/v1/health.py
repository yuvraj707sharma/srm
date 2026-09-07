from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.session import get_db
from app.services.vector.qdrant import QdrantVectorSearchService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/health/live")
async def liveness_check():
    """Process liveness only. Must not depend on DB/Qdrant."""
    return {"status": "ok", "service": "jecrc-scm-api"}

@router.get("/health/ready")
async def readiness_check(response: Response, db: AsyncSession = Depends(get_db)):
    """Readiness check. Validates DB and Qdrant connectivity safely."""
    ready = True
    reasons = []

    # Check MySQL
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Readiness check failed (MySQL): {type(e).__name__}")
        ready = False
        reasons.append("database")

    # Check Qdrant
    try:
        qdrant_service = QdrantVectorSearchService()
        await qdrant_service.initialize()
    except Exception as e:
        logger.error(f"Readiness check failed (Qdrant): {type(e).__name__}")
        ready = False
        reasons.append("qdrant")

    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "unavailable_services": reasons}

    return {"status": "ok"}
