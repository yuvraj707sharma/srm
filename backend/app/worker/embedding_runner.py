import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import sys
import os

# Allow running as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.session import AsyncSessionLocal
from app.models.extraction import CatalogProductDraft
from app.models.embedding import CatalogEmbeddingJob
from app.services.ai.embedding import GeminiEmbeddingProvider, EmbeddingProviderError
from app.services.vector.qdrant import QdrantVectorSearchService
from app.core.config import settings
from app.worker.shutdown import get_shutdown_handler

from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

MAX_RETRIES = 3
STALE_TIMEOUT_MINUTES = 30
POLL_INTERVAL_SECONDS = 5

def _get_embedding_provider():
    return GeminiEmbeddingProvider()

def _get_vector_service():
    return QdrantVectorSearchService()

async def claim_and_process_jobs() -> None:
    logger.info("Embedding Job Runner started.")
    shutdown = get_shutdown_handler()
    
    while not shutdown.is_shutting_down():
        try:
            async with AsyncSessionLocal() as db:
                await _recover_stale_jobs(db)
                job = await _claim_next_pending_job(db)
            
            if job is None:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue
                
            await _process_job(job.id)
            
        except Exception as exc:
            logger.error("Fatal worker loop error: %s", exc, exc_info=True)
            await asyncio.sleep(10)

async def _recover_stale_jobs(db: AsyncSession) -> None:
    stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=STALE_TIMEOUT_MINUTES)
    stmt = (
        select(CatalogEmbeddingJob).where(
            CatalogEmbeddingJob.status == "PROCESSING",
            CatalogEmbeddingJob.updated_at < stale_threshold,
        ).with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    stale_jobs = result.scalars().all()
    
    for job in stale_jobs:
        if job.retry_count >= MAX_RETRIES:
            job.status = "FAILED"
            job.error_details = "Job timed out and exceeded maximum retries."
            job.completed_at = datetime.now(timezone.utc)
        else:
            job.status = "PENDING"
            job.retry_count += 1
            job.error_details = "Recovered from stale PROCESSING state."
            
    if stale_jobs:
        await db.commit()

async def _claim_next_pending_job(db: AsyncSession) -> CatalogEmbeddingJob | None:
    stmt = (
        select(CatalogEmbeddingJob)
        .where(CatalogEmbeddingJob.status == "PENDING")
        .order_by(CatalogEmbeddingJob.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    job = result.scalars().first()
    
    if not job:
        return None
        
    job.status = "PROCESSING"
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    return job

async def _process_job(job_id: str) -> None:
    provider = _get_embedding_provider()
    vector_service = _get_vector_service()
    
    async with AsyncSessionLocal() as db:
        job = await db.get(CatalogEmbeddingJob, job_id)
        if not job:
            return
            
        # Fetch draft
        draft = await db.get(CatalogProductDraft, job.draft_id)
        if not draft or draft.status != "APPROVED":
            job.status = "FAILED"
            job.error_details = "Draft not found or not APPROVED."
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return
            
        # Create deterministic embedding text
        import json
        attrs = ""
        if draft.attributes_json:
            try:
                attrs = " " + " ".join([f"{k}: {v}" for k, v in json.loads(draft.attributes_json).items() if v])
            except Exception:
                pass
                
        text = f"{draft.product_name or ''} {draft.description or ''}{attrs}".strip()
        
        try:
            # Generate embedding
            vector = await provider.generate_embedding(text)
            
            # Upsert vector
            metadata = {
                "draft_id": draft.id,
                "catalog_id": draft.catalog_id,
                "vendor_organization_id": draft.vendor_organization_id,
                "product_name": draft.product_name,
                "description": draft.description,
                "attributes": draft.attributes_json,
                "status": draft.status,
            }
            
            success = await vector_service.upsert(draft.id, text, metadata, vector)
            if not success:
                raise Exception("Qdrant upsert failed")
                
            job.status = "COMPLETED"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            
        except EmbeddingProviderError as e:
            # Permanent error usually, or exhausted retries
            await db.rollback()
            async with AsyncSessionLocal() as err_db:
                err_job = await err_db.get(CatalogEmbeddingJob, job_id)
                if err_job:
                    err_job.status = "FAILED"
                    err_job.error_details = str(e)
                    err_job.completed_at = datetime.now(timezone.utc)
                    await err_db.commit()
                    
        except Exception as e:
            await db.rollback()
            async with AsyncSessionLocal() as err_db:
                err_job = await err_db.get(CatalogEmbeddingJob, job_id)
                if err_job:
                    err_job.retry_count += 1
                    err_job.error_details = str(e)
                    if err_job.retry_count >= MAX_RETRIES:
                        err_job.status = "FAILED"
                        err_job.completed_at = datetime.now(timezone.utc)
                    else:
                        err_job.status = "PENDING"
                    await err_db.commit()

if __name__ == "__main__":
    try:
        asyncio.run(claim_and_process_jobs())
    except KeyboardInterrupt:
        logger.info("Worker stopped by operator (KeyboardInterrupt).")
    finally:
        logger.info("Worker has cleanly exited.")
