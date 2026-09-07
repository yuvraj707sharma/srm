"""
Phase 3B extraction pipeline.

Orchestrates the full catalog extraction flow:

  DocumentVersion (immutable)
      ↓
  LocalStorageService.get(stored_key)
      ↓
  PDF text extraction (PyMuPDF)
      ↓
  GeminiService.extract_catalog()
      ↓
  Pydantic validation (inside GeminiService)
      ↓
  AIExtractionRecord  (one per job, provenance record)
      ↓
  CatalogProductDraft × N  (one per extracted product, status=NEEDS_REVIEW)

Tenant isolation:
  All created rows use vendor_organization_id from the trusted DB job record.
  Gemini never determines ownership.

Atomicity:
  All DB writes (AIExtractionRecord + drafts) happen inside a single flush;
  the job is only marked COMPLETED after a successful commit of those records.
  On any failure the caller (job_runner) rolls back and applies retry policy.

Idempotency:
  On retry, any drafts previously persisted for this job are deleted before
  re-creating them to avoid duplicates.
"""
import asyncio
import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.document import DocumentVersion
from app.models.extraction import (
    AIExtractionRecord,
    CatalogExtractionJob,
    CatalogProductDraft,
)
from app.services.ai.base import AIExtractionProvider, CatalogExtractionResult

from app.services.storage.local import LocalStorageService
from app.services.ai.pdf_extractor import extract_text_from_pdf
from app.core.config import settings

logger = logging.getLogger(__name__)


class ExtractionPipelineError(Exception):
    """Non-retryable pipeline error (bad document, missing file, etc.)."""


async def run_extraction_pipeline(
    job: CatalogExtractionJob,
    db: AsyncSession,
    ai_provider: AIExtractionProvider,
    storage: LocalStorageService,
) -> None:
    """
    Execute the full Phase 3B extraction pipeline for a claimed job.

    On success:  AIExtractionRecord + CatalogProductDraft rows are committed.
    On failure:  raises an exception; the caller must rollback and update job.

    Args:
        job:         A CatalogExtractionJob that is already in PROCESSING state.
        db:          Async DB session managed by the caller (job_runner).
        ai_provider: An AIExtractionProvider implementation (GeminiService).
        storage:     LocalStorageService instance for fetching document bytes.
    """

    # ── 1. Resolve the immutable DocumentVersion ──────────────────────────
    doc_version = await _get_document_version(job, db)

    # ── 2. Fetch document bytes via storage abstraction ───────────────────
    logger.info("Fetching document bytes for stored_key=%s", doc_version.stored_key)
    try:
        pdf_bytes = await storage.get(doc_version.stored_key)
    except Exception as exc:
        raise ExtractionPipelineError(
            f"Failed to fetch document from storage: {exc}"
        ) from exc

    # ── 3. Call AI provider directly with the document ────────────────────
    logger.info("Sending document bytes to AI provider (job=%s)", job.id)
    
    # We pass the MIME type. For now, assume application/pdf as that's all we upload
    mime_type = "application/pdf"
    
    try:
        catalog_result: CatalogExtractionResult = await ai_provider.extract_catalog_from_document(
            document_bytes=pdf_bytes,
            mime_type=mime_type,
        )
    except AIExtractionProvider.ExtractionValidationError as exc:
        raise ExtractionPipelineError(f"AI output failed schema validation: {exc}") from exc
    except AIExtractionProvider.ExtractionProviderError as exc:
        # Re-raise as-is so the caller can apply retry policy
        raise

    if not catalog_result.products:
        raise ExtractionPipelineError(
            "AI returned zero products. The document might not contain any product data."
        )

    logger.info(
        "AI returned %d products (job=%s, truncated=%s)",
        len(catalog_result.products),
        job.id,
        catalog_result.truncated,
    )

    # ── 5. Idempotency: delete any drafts from a previous failed attempt ──
    await _delete_existing_drafts(job, db)

    # ── 6. Persist AIExtractionRecord ─────────────────────────────────────
    raw_json = json.dumps(
        {"products": [p.model_dump(exclude_none=True) for p in catalog_result.products]},
        ensure_ascii=False,
    )
    # Truncate stored raw JSON to prevent unbounded TEXT column growth
    if len(raw_json) > 65_000:
        raw_json = raw_json[:65_000] + "...[truncated]"

    ai_record = AIExtractionRecord(
        job_id=job.id,
        product_draft_id=None,          # updated per-draft below if needed; or left as job-level
        vendor_organization_id=job.vendor_organization_id,  # from trusted DB record, NOT Gemini
        catalog_id=job.catalog_id,
        document_version_id=job.document_version_id,
        raw_json_snippet=raw_json,
        model_provider_info=f"google-generativeai/{settings.GEMINI_MODEL}",
    )
    db.add(ai_record)
    await db.flush()   # get ai_record.id without committing

    # ── 7. Create CatalogProductDraft per extracted product ───────────────
    drafts: list[CatalogProductDraft] = []
    for product in catalog_result.products:
        attributes: dict = {}
        if product.category:
            attributes["category"] = product.category
        if product.sku:
            attributes["sku"] = product.sku
        if product.unit:
            attributes["unit"] = product.unit
        if product.price is not None:
            attributes["price"] = product.price
        if product.currency:
            attributes["currency"] = product.currency
        if product.specifications:
            attributes["specifications"] = product.specifications

        draft = CatalogProductDraft(
            # Ownership from trusted job — Gemini never sets these
            vendor_organization_id=job.vendor_organization_id,
            catalog_id=job.catalog_id,
            document_version_id=job.document_version_id,
            product_name=product.product_name,
            description=product.description,
            attributes_json=json.dumps(attributes, ensure_ascii=False) if attributes else None,
            # AI MUST NOT set APPROVED — always NEEDS_REVIEW
            status="NEEDS_REVIEW",
        )
        db.add(draft)
        drafts.append(draft)

    await db.flush()   # assign IDs

    # Update AIExtractionRecord to reference the first draft as a convenience
    # (The full provenance is job→ai_record→drafts via vendor/catalog/doc_ver FKs)
    if drafts:
        ai_record.product_draft_id = drafts[0].id

    # Single commit for atomicity: either all records land, or none do
    await db.commit()

    logger.info(
        "Extraction complete: %d drafts created (job=%s)",
        len(drafts),
        job.id,
    )


# ── Private helpers ─────────────────────────────────────────────────────────


async def _get_document_version(
    job: CatalogExtractionJob, db: AsyncSession
) -> DocumentVersion:
    """
    Load the exact immutable DocumentVersion associated with the job.
    Raises ExtractionPipelineError if it cannot be found.
    """
    stmt = select(DocumentVersion).where(
        DocumentVersion.id == job.document_version_id
    )
    result = await db.execute(stmt)
    doc_version = result.scalars().first()
    if not doc_version:
        raise ExtractionPipelineError(
            f"DocumentVersion {job.document_version_id} not found in database."
        )
    return doc_version


async def _delete_existing_drafts(
    job: CatalogExtractionJob, db: AsyncSession
) -> None:
    """
    Delete any CatalogProductDraft rows linked to this job's catalog+docversion
    so that a retry does not create duplicates.

    We identify them by the combination of catalog_id + document_version_id
    + vendor_organization_id (NOT job_id, since drafts don't have a job_id FK).
    """
    from sqlalchemy import delete

    stmt = delete(CatalogProductDraft).where(
        CatalogProductDraft.vendor_organization_id == job.vendor_organization_id,
        CatalogProductDraft.catalog_id == job.catalog_id,
        CatalogProductDraft.document_version_id == job.document_version_id,
    )
    result = await db.execute(stmt)
    if result.rowcount:
        logger.info(
            "Idempotency cleanup: deleted %d existing draft(s) before retry (job=%s)",
            result.rowcount,
            job.id,
        )
    await db.flush()
