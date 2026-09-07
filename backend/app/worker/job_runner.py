"""
Standalone MySQL-backed catalog extraction job runner.

Run this process independently from the FastAPI API server:

    python -m app.worker.job_runner

The worker:
  1. Recovers stale PROCESSING jobs (crash recovery).
  2. Claims a single PENDING job using SELECT … FOR UPDATE SKIP LOCKED.
  3. Runs the Phase 3B extraction pipeline.
  4. Marks the job COMPLETED or (on failure) applies bounded retry policy.

Locking strategy:
  SELECT … FOR UPDATE SKIP LOCKED guarantees two concurrent worker processes
  cannot claim the same job simultaneously.

Crash recovery:
  Jobs stuck in PROCESSING for > STALE_TIMEOUT_MINUTES are transitioned back
  to PENDING (retry_count incremented) or permanently FAILED when max retries
  are exhausted.

Atomicity:
  The job claim (PROCESSING) is committed *before* expensive work begins so
  the DB is the durable source of truth.  If the worker crashes, the crash-
  recovery loop will reclaim the job on the next startup.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import func

import sys
import os

# Allow running as a script: `python app/worker/job_runner.py`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.session import AsyncSessionLocal
# Import related models to ensure SQLAlchemy metadata resolves foreign keys
import app.models.catalog
import app.models.document
import app.models.user
import app.models.auth
import app.models.vendor
from app.models.extraction import CatalogExtractionJob
from app.services.ai.pipeline import run_extraction_pipeline, ExtractionPipelineError
from app.services.ai.base import AIExtractionProvider
from app.services.storage.local import LocalStorageService
from app.worker.shutdown import get_shutdown_handler

from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

MAX_RETRIES = 3
STALE_TIMEOUT_MINUTES = 30
POLL_INTERVAL_SECONDS = 5


def _get_ai_provider() -> AIExtractionProvider:
    """
    Instantiate the configured AI provider.
    If GEMINI_API_KEY is absent (test/dev environment), return a no-op stub
    that raises clearly rather than silently succeeding.
    """
    from app.core.config import settings
    if settings.GEMINI_API_KEY:
        from app.services.ai.gemini import GeminiService
        return GeminiService()
    raise RuntimeError(
        "GEMINI_API_KEY is not configured. "
        "The worker cannot process extraction jobs without a valid API key."
    )


async def claim_and_process_jobs() -> None:
    """
    Main polling loop. Runs forever until KeyboardInterrupt.
    """
    logger.info("Catalog Extraction Job Runner started.")
    storage = LocalStorageService()
    shutdown = get_shutdown_handler()

    while not shutdown.is_shutting_down():
        try:
            async with AsyncSessionLocal() as db:
                await _recover_stale_jobs(db)
                job = await _claim_next_pending_job(db)

            if job is None:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

            # Process the claimed job in its own session so a rollback on
            # processing failure does not affect the claim commit.
            await _process_job(job.id, storage)

        except Exception as exc:
            logger.error("Fatal worker loop error: %s", exc, exc_info=True)
            await asyncio.sleep(10)


async def _recover_stale_jobs(db: AsyncSession) -> None:
    """
    Find PROCESSING jobs that have not been updated for STALE_TIMEOUT_MINUTES
    and reset them to PENDING (or FAILED if max retries reached).
    """
    stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=STALE_TIMEOUT_MINUTES)
    stmt = (
        select(CatalogExtractionJob).where(
            CatalogExtractionJob.status == "PROCESSING",
            CatalogExtractionJob.updated_at < stale_threshold,
        )
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    stale_jobs = result.scalars().all()

    for job in stale_jobs:
        logger.warning("Recovering stale job %s (retry_count=%d)", job.id, job.retry_count)
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


async def _claim_next_pending_job(db: AsyncSession) -> CatalogExtractionJob | None:
    """
    Atomically claim a single PENDING job using FOR UPDATE SKIP LOCKED.
    Returns the claimed job (status=PROCESSING) or None if queue is empty.
    """
    stmt = (
        select(CatalogExtractionJob)
        .where(CatalogExtractionJob.status == "PENDING")
        .order_by(CatalogExtractionJob.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    job = result.scalars().first()

    if not job:
        return None

    logger.info("Claiming job %s (catalog=%s)", job.id, job.catalog_id)
    job.status = "PROCESSING"
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    return job


async def _process_job(job_id: str, storage: LocalStorageService) -> None:
    """
    Run the full extraction pipeline for a single job in a fresh session.
    On success: marks the job COMPLETED.
    On failure: increments retry_count; marks PENDING or FAILED.
    """
    ai_provider = _get_ai_provider()

    async with AsyncSessionLocal() as db:
        job = await db.get(CatalogExtractionJob, job_id)
        if job is None:
            logger.error("Job %s disappeared from DB; skipping.", job_id)
            return

        try:
            await run_extraction_pipeline(
                job=job,
                db=db,
                ai_provider=ai_provider,
                storage=storage,
            )
            # Pipeline committed its own records; now mark the job complete
            job.status = "COMPLETED"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info("Job %s COMPLETED successfully.", job_id)

        except ExtractionPipelineError as exc:
            await db.rollback()
            logger.error("Job %s failed with non-retryable pipeline error: %s", job_id, exc, exc_info=True)
            async with AsyncSessionLocal() as err_db:
                err_job = await err_db.get(CatalogExtractionJob, job_id)
                if err_job:
                    safe_error = _sanitise_error(str(exc))
                    err_job.error_details = safe_error
                    err_job.status = "FAILED"
                    err_job.retry_count = MAX_RETRIES  # Consume retries so it doesn't look retryable
                    err_job.completed_at = datetime.now(timezone.utc)
                    await err_db.commit()
                    logger.warning("Job %s permanently FAILED (non-retryable).", job_id)

        except Exception as exc:
            await db.rollback()
            logger.error("Job %s failed: %s", job_id, exc, exc_info=True)

            # Re-fetch after rollback
            async with AsyncSessionLocal() as err_db:
                err_job = await err_db.get(CatalogExtractionJob, job_id)
                if err_job:
                    err_job.retry_count += 1
                    # Sanitise error message — do not expose internal paths or credentials
                    safe_error = _sanitise_error(str(exc))
                    err_job.error_details = safe_error
                    if err_job.retry_count >= MAX_RETRIES:
                        err_job.status = "FAILED"
                        err_job.completed_at = datetime.now(timezone.utc)
                        logger.warning("Job %s permanently FAILED after %d retries.", job_id, err_job.retry_count)
                    else:
                        err_job.status = "PENDING"
                        logger.info("Job %s returned to PENDING for retry (attempt %d).", job_id, err_job.retry_count)
                    await err_db.commit()


def _sanitise_error(raw: str) -> str:
    """
    Remove any file-system paths or stack-trace noise from error strings
    before persisting them in the database (visible to vendors via API).
    """
    import re
    # Strip Windows/Unix paths
    sanitised = re.sub(r'[A-Za-z]:\\[^\s]*', '[path]', raw)
    sanitised = re.sub(r'/[^\s]+', '[path]', sanitised)
    # Truncate to a safe display length
    return sanitised[:2000]


if __name__ == "__main__":
    try:
        asyncio.run(claim_and_process_jobs())
    except KeyboardInterrupt:
        logger.info("Worker stopped by operator (KeyboardInterrupt).")
    finally:
        logger.info("Worker has cleanly exited.")
