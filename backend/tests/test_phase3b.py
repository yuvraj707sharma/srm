"""
Phase 3B tests — Gemini AI extraction pipeline.

Gemini is ALWAYS mocked; no real API calls are made.

Coverage:
  - PDF extraction (valid, multi-page, empty, corrupt, over-size)
  - GeminiService (mocked): valid response, malformed, schema failure,
    empty products, timeout, provider error, rate-limit
  - Draft creation: one product → one draft, many products → many drafts
  - All drafts must be NEEDS_REVIEW
  - Ownership (vendor_organization_id, catalog_id, document_version_id)
  - Provenance chain integrity
  - Idempotency: retry does not duplicate drafts
  - AI approval safety: AI output can NEVER produce APPROVED status
  - Tenant isolation via extraction pipeline
"""
import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.extraction import (
    AIExtractionRecord,
    CatalogExtractionJob,
    CatalogProductDraft,
)
from app.models.document import Document, DocumentVersion
from app.models.vendor import VendorOrganization
from app.services.ai.base import (
    AIExtractionProvider,
    CatalogExtractionResult,
    ExtractedProduct,
)
from app.services.ai.pdf_extractor import ExtractionOutput, PDFExtractionError, extract_text_from_pdf
from app.services.ai.pipeline import ExtractionPipelineError, run_extraction_pipeline


# ── Shared fixtures ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def vendor_a_p3b(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_a_p3b@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor Alpha P3B",
        organization_type="Private Limited",
        country="India",
        status="DRAFT",
        verification_status="UNVERIFIED",
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org


@pytest_asyncio.fixture
async def vendor_b_p3b(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_b_p3b@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor Beta P3B",
        organization_type="Private Limited",
        country="India",
        status="DRAFT",
        verification_status="UNVERIFIED",
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org


def _make_job(
    vendor_organization_id: str,
    catalog_id: str,
    document_version_id: str,
    status: str = "PROCESSING",
) -> CatalogExtractionJob:
    return CatalogExtractionJob(
        id=str(uuid.uuid4()),
        vendor_organization_id=vendor_organization_id,
        catalog_id=catalog_id,
        document_version_id=document_version_id,
        status=status,
        retry_count=0,
    )


def _make_valid_ai_result(n: int = 2) -> CatalogExtractionResult:
    return CatalogExtractionResult(
        products=[
            ExtractedProduct(
                product_name=f"Product {i}",
                description=f"Description {i}",
                category="Electronics",
                sku=f"SKU-{i:03d}",
                unit="piece",
                price=100.0 * i,
                currency="INR",
                specifications=f"Spec {i}",
            )
            for i in range(1, n + 1)
        ]
    )


# ── PDF Extraction Tests ─────────────────────────────────────────────────────

class TestPDFExtraction:
    """Unit tests for the pdf_extractor module (no I/O, no AI)."""

    def test_valid_pdf_extraction(self):
        """A real minimal PDF should yield non-empty text."""
        import fitz
        # Build a minimal one-page PDF in memory
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Widget A - Rs. 100 - Electronics")
        pdf_bytes = doc.tobytes()
        doc.close()

        result = extract_text_from_pdf(pdf_bytes, max_output_chars=100_000)
        assert not result.is_empty
        assert "Widget A" in result.text
        assert result.page_count == 1
        assert not result.truncated

    def test_multi_page_pdf(self):
        """Multi-page PDFs should include all pages until the char limit."""
        import fitz
        doc = fitz.open()
        for i in range(5):
            page = doc.new_page()
            page.insert_text((72, 72), f"Product {i} on page {i + 1}")
        pdf_bytes = doc.tobytes()
        doc.close()

        result = extract_text_from_pdf(pdf_bytes, max_output_chars=100_000)
        assert result.page_count == 5
        assert "Product 0" in result.text
        assert "Product 4" in result.text

    def test_char_limit_triggers_truncation(self):
        """Text exceeding max_output_chars must be cut and truncated=True.
        
        PyMuPDF clips overlong text to what fits on a single page (~74 chars
        for a small A4 page).  We use a 10-page PDF so that the cumulative
        text reliably exceeds the tiny max_output_chars limit.
        """
        import fitz
        doc = fitz.open()
        for i in range(10):
            page = doc.new_page()
            page.insert_text((72, 72), f"Product {i} - description on page {i + 1} - Rs. 100")
        pdf_bytes = doc.tobytes()
        doc.close()

        # Tiny limit: forces truncation after the first couple of pages
        result = extract_text_from_pdf(pdf_bytes, max_output_chars=50)
        assert result.truncated

    def test_empty_bytes_raises(self):
        with pytest.raises(PDFExtractionError, match="empty"):
            extract_text_from_pdf(b"", max_output_chars=100_000)

    def test_corrupt_bytes_raises(self):
        with pytest.raises(PDFExtractionError):
            extract_text_from_pdf(b"not a pdf at all!!!", max_output_chars=100_000)

    def test_oversized_bytes_raises(self):
        # Simulate bytes larger than MAX_BYTES (50 MB)
        from app.services.ai.pdf_extractor import MAX_BYTES
        big = b"x" * (MAX_BYTES + 1)
        with pytest.raises(PDFExtractionError, match="maximum allowed size"):
            extract_text_from_pdf(big, max_output_chars=100_000)


# ── GeminiService Mock Tests ─────────────────────────────────────────────────

class MockAIProvider(AIExtractionProvider):
    """Configurable mock that returns or raises as needed."""

    def __init__(self, result=None, raise_exc=None):
        self._result = result
        self._raise = raise_exc

    async def extract_catalog(self, catalog_text, truncated=False):
        if self._raise:
            raise self._raise
        return self._result

    async def extract_catalog_from_document(self, document_bytes: bytes, mime_type: str):
        if self._raise:
            raise self._raise
        return self._result


class TestAIProviderBehaviour:
    """Test pipeline reactions to various AI provider outcomes."""

    @pytest.mark.asyncio
    async def test_valid_structured_response_creates_drafts(self, db_session: AsyncSession, vendor_a_p3b):
        _, _, org = vendor_a_p3b
        job, doc_ver = await _create_job_and_doc_in_db(org.id, db_session)

        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        provider = MockAIProvider(result=_make_valid_ai_result(n=3))

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Product catalog content", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            await run_extraction_pipeline(job, db_session, provider, storage_mock)

        drafts = await _get_drafts(job, db_session)
        assert len(drafts) == 3
        for draft in drafts:
            assert draft.status == "NEEDS_REVIEW"           # AI must not approve
            assert draft.vendor_organization_id == org.id
            assert draft.catalog_id == job.catalog_id
            assert draft.document_version_id == job.document_version_id

    @pytest.mark.asyncio
    async def test_empty_products_raises_pipeline_error(self, db_session: AsyncSession, vendor_a_p3b):
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session)
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        provider = MockAIProvider(result=CatalogExtractionResult(products=[]))

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Some text", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            with pytest.raises(ExtractionPipelineError, match="zero products"):
                await run_extraction_pipeline(job, db_session, provider, storage_mock)

    @pytest.mark.asyncio
    async def test_ai_validation_error_raises_pipeline_error(self, db_session: AsyncSession, vendor_a_p3b):
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session)
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        provider = MockAIProvider(
            raise_exc=AIExtractionProvider.ExtractionValidationError("Bad schema")
        )

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Some text", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            with pytest.raises(ExtractionPipelineError, match="schema validation"):
                await run_extraction_pipeline(job, db_session, provider, storage_mock)

    @pytest.mark.asyncio
    async def test_provider_error_propagates(self, db_session: AsyncSession, vendor_a_p3b):
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session)
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        provider = MockAIProvider(
            raise_exc=AIExtractionProvider.ExtractionProviderError("Timeout")
        )

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Some text", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            with pytest.raises(AIExtractionProvider.ExtractionProviderError):
                await run_extraction_pipeline(job, db_session, provider, storage_mock)

    @pytest.mark.asyncio
    async def test_storage_error_raises_pipeline_error(self, db_session: AsyncSession, vendor_a_p3b):
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session)

        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(side_effect=Exception("Storage unavailable"))

        provider = MockAIProvider(result=_make_valid_ai_result())

        with pytest.raises(ExtractionPipelineError, match="storage"):
            await run_extraction_pipeline(job, db_session, provider, storage_mock)


# ── AI Approval Safety ────────────────────────────────────────────────────────

class TestAIApprovalSafety:
    @pytest.mark.asyncio
    async def test_all_drafts_are_needs_review_never_approved(self, db_session: AsyncSession, vendor_a_p3b):
        """Core safety requirement: AI can NEVER produce APPROVED drafts."""
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session, n_products=5)

        provider = MockAIProvider(result=_make_valid_ai_result(n=5))
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Product list", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            await run_extraction_pipeline(job, db_session, provider, storage_mock)

        drafts = await _get_drafts(job, db_session)
        assert len(drafts) == 5
        for draft in drafts:
            assert draft.status == "NEEDS_REVIEW", (
                f"Draft {draft.id} has status={draft.status!r}, expected NEEDS_REVIEW"
            )
            assert draft.status != "APPROVED"
            assert draft.status != "REJECTED"


# ── Provenance Tests ──────────────────────────────────────────────────────────

class TestProvenance:
    @pytest.mark.asyncio
    async def test_provenance_chain_intact(self, db_session: AsyncSession, vendor_a_p3b):
        """
        Verify: Job → AIExtractionRecord → CatalogProductDraft all share the
        same vendor_organization_id / catalog_id / document_version_id.
        """
        _, _, org = vendor_a_p3b
        job, doc_ver = await _create_job_and_doc_in_db(org.id, db_session)
        provider = MockAIProvider(result=_make_valid_ai_result(n=2))
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Items", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            await run_extraction_pipeline(job, db_session, provider, storage_mock)

        # Verify AIExtractionRecord
        rec_stmt = select(AIExtractionRecord).where(AIExtractionRecord.job_id == job.id)
        rec_res = await db_session.execute(rec_stmt)
        ai_record = rec_res.scalars().first()
        assert ai_record is not None
        assert ai_record.vendor_organization_id == org.id
        assert ai_record.catalog_id == job.catalog_id
        assert ai_record.document_version_id == job.document_version_id

        # Verify drafts share provenance
        drafts = await _get_drafts(job, db_session)
        assert len(drafts) == 2
        for draft in drafts:
            assert draft.vendor_organization_id == org.id
            assert draft.catalog_id == job.catalog_id
            assert draft.document_version_id == job.document_version_id


# ── Idempotency Tests ─────────────────────────────────────────────────────────

class TestIdempotency:
    @pytest.mark.asyncio
    async def test_retry_does_not_duplicate_drafts(self, db_session: AsyncSession, vendor_a_p3b):
        """If a job is retried, old drafts are deleted before new ones are created."""
        _, _, org = vendor_a_p3b
        job, _ = await _create_job_and_doc_in_db(org.id, db_session)
        provider = MockAIProvider(result=_make_valid_ai_result(n=2))
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Items", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            # First run
            await run_extraction_pipeline(job, db_session, provider, storage_mock)
            drafts_after_first = await _get_drafts(job, db_session)
            assert len(drafts_after_first) == 2

            # Simulate retry: run again (same job, same catalog, same doc_ver)
            await run_extraction_pipeline(job, db_session, provider, storage_mock)
            drafts_after_retry = await _get_drafts(job, db_session)
            assert len(drafts_after_retry) == 2  # NOT 4


# ── Tenant Isolation Tests ────────────────────────────────────────────────────

class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_pipeline_uses_job_vendor_id_not_ai(self, db_session: AsyncSession, vendor_a_p3b, vendor_b_p3b):
        """Drafts must always use the job's vendor_organization_id, never AI output."""
        _, _, org_a = vendor_a_p3b
        _, _, org_b = vendor_b_p3b
        job, _ = await _create_job_and_doc_in_db(org_a.id, db_session)

        # Even if somehow the AI returned org_b's ID (impossible since AI has no such
        # knowledge, but we confirm by checking after pipeline runs)
        provider = MockAIProvider(result=_make_valid_ai_result(n=1))
        storage_mock = AsyncMock()
        storage_mock.get = AsyncMock(return_value=_minimal_pdf_bytes())

        with patch("app.services.ai.pipeline.extract_text_from_pdf", return_value=ExtractionOutput(
            text="Items", page_count=1, truncated=False, is_empty=False, warning=None
        )):
            await run_extraction_pipeline(job, db_session, provider, storage_mock)

        drafts = await _get_drafts(job, db_session)
        for draft in drafts:
            assert draft.vendor_organization_id == org_a.id
            assert draft.vendor_organization_id != org_b.id

    @pytest.mark.asyncio
    async def test_vendor_b_cannot_trigger_job_for_vendor_a_catalog(
        self, async_client: AsyncClient, vendor_a_p3b, vendor_b_p3b, db_session: AsyncSession
    ):
        """End-to-end: Vendor B cannot enqueue extraction for Vendor A's catalog."""
        _, token_a, _ = vendor_a_p3b
        _, token_b, _ = vendor_b_p3b
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        with open("tests/fixtures/sample.pdf", "rb") as f:
            doc_resp = await async_client.post(
                "/api/v1/vendor/documents",
                params={"document_type": "CATALOG"},
                files={"file": ("sample.pdf", f, "application/pdf")},
                headers=headers_a,
            )
        doc_ver_id = doc_resp.json()["version_id"]
        cat_resp = await async_client.post(
            "/api/v1/vendor/catalogs",
            json={"title": "A Catalog", "document_version_id": doc_ver_id},
            headers=headers_a,
        )
        catalog_id = cat_resp.json()["id"]

        # Vendor B tries to trigger extraction on Vendor A's catalog
        resp = await async_client.post(
            f"/api/v1/vendor/catalogs/{catalog_id}/extract",
            headers=headers_b,
        )
        assert resp.status_code == 404


# ── API Integration Tests ─────────────────────────────────────────────────────

class TestExtractionAPI:
    @pytest.mark.asyncio
    async def test_extract_endpoint_returns_pending_job(
        self, async_client: AsyncClient, vendor_a_p3b
    ):
        _, token, _ = vendor_a_p3b
        headers = {"Authorization": f"Bearer {token}"}

        with open("tests/fixtures/sample.pdf", "rb") as f:
            doc_resp = await async_client.post(
                "/api/v1/vendor/documents",
                params={"document_type": "CATALOG"},
                files={"file": ("sample.pdf", f, "application/pdf")},
                headers=headers,
            )
        doc_ver_id = doc_resp.json()["version_id"]
        cat_resp = await async_client.post(
            "/api/v1/vendor/catalogs",
            json={"title": "API Extraction Catalog", "document_version_id": doc_ver_id},
            headers=headers,
        )
        catalog_id = cat_resp.json()["id"]

        extract_resp = await async_client.post(
            f"/api/v1/vendor/catalogs/{catalog_id}/extract",
            headers=headers,
        )
        assert extract_resp.status_code == 200
        data = extract_resp.json()
        assert data["status"] == "PENDING"
        assert "job_id" in data
        assert "document_version_id" in data
        # API must not expose raw internal paths or keys
        assert "GEMINI_API_KEY" not in str(data)
        assert "stored_key" not in str(data)

    @pytest.mark.asyncio
    async def test_status_endpoint_returns_correct_fields(
        self, async_client: AsyncClient, vendor_a_p3b
    ):
        _, token, _ = vendor_a_p3b
        headers = {"Authorization": f"Bearer {token}"}

        with open("tests/fixtures/sample.pdf", "rb") as f:
            doc_resp = await async_client.post(
                "/api/v1/vendor/documents",
                params={"document_type": "CATALOG"},
                files={"file": ("sample.pdf", f, "application/pdf")},
                headers=headers,
            )
        doc_ver_id = doc_resp.json()["version_id"]
        cat_resp = await async_client.post(
            "/api/v1/vendor/catalogs",
            json={"title": "Status Test Catalog", "document_version_id": doc_ver_id},
            headers=headers,
        )
        catalog_id = cat_resp.json()["id"]
        await async_client.post(f"/api/v1/vendor/catalogs/{catalog_id}/extract", headers=headers)

        status_resp = await async_client.get(
            f"/api/v1/vendor/catalogs/{catalog_id}/extraction-status",
            headers=headers,
        )
        assert status_resp.status_code == 200
        data = status_resp.json()
        assert "status" in data
        assert "job_id" in data
        assert "retry_count" in data
        # Must NOT expose API keys or stack traces
        assert "GEMINI" not in str(data)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _minimal_pdf_bytes() -> bytes:
    """Return a real minimal PDF so storage.get() can return something meaningful."""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Product Catalog Item 1 - Rs. 500")
    b = doc.tobytes()
    doc.close()
    return b


async def _create_job_and_doc_in_db(
    vendor_org_id: str,
    db: AsyncSession,
    n_products: int = 0,
) -> tuple[CatalogExtractionJob, DocumentVersion]:
    """
    Create a minimal Document, DocumentVersion, catalog record, and extraction job
    so the pipeline can be called without a real HTTP upload.
    """
    from app.models.catalog import CatalogRecord

    # Document + version
    doc = Document(
        vendor_organization_id=vendor_org_id,
        document_type="CATALOG",
    )
    db.add(doc)
    await db.flush()

    stored_key = f"{vendor_org_id}/{doc.id}/v1_{uuid.uuid4().hex}"
    doc_ver = DocumentVersion(
        document_id=doc.id,
        version_number=1,
        original_filename="test_catalog.pdf",
        stored_key=stored_key,
        mime_type="application/pdf",
        file_size=1024,
        checksum_sha256="deadbeef" * 8,
    )
    db.add(doc_ver)
    await db.flush()

    catalog = CatalogRecord(
        vendor_organization_id=vendor_org_id,
        title="Test Catalog P3B",
        document_version_id=doc_ver.id,
        status="ACTIVE",
    )
    db.add(catalog)
    await db.flush()

    job = CatalogExtractionJob(
        vendor_organization_id=vendor_org_id,
        catalog_id=catalog.id,
        document_version_id=doc_ver.id,
        status="PROCESSING",
        retry_count=0,
    )
    db.add(job)
    await db.commit()

    return job, doc_ver


async def _get_drafts(
    job: CatalogExtractionJob,
    db: AsyncSession,
) -> list[CatalogProductDraft]:
    stmt = select(CatalogProductDraft).where(
        CatalogProductDraft.catalog_id == job.catalog_id,
        CatalogProductDraft.document_version_id == job.document_version_id,
        CatalogProductDraft.vendor_organization_id == job.vendor_organization_id,
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


class TestF07NonRetryableErrors:
    @pytest.mark.asyncio
    async def test_non_retryable_error_goes_to_failed(self, db_session: AsyncSession, vendor_a_p3b):
        from app.worker.job_runner import _process_job
        from app.services.storage.local import LocalStorageService
        from unittest.mock import patch, AsyncMock
        from app.services.ai.pipeline import ExtractionPipelineError

        _, _, org = vendor_a_p3b
        job, doc_ver = await _create_job_and_doc_in_db(org.id, db_session)
        job_id = job.id

        storage_mock = AsyncMock(spec=LocalStorageService)
        
        # We patch run_extraction_pipeline to throw ExtractionPipelineError
        with patch("app.worker.job_runner._get_ai_provider", return_value=None):
            with patch("app.worker.job_runner.run_extraction_pipeline", side_effect=ExtractionPipelineError("Corrupt PDF")):
                # _process_job runs in its own session, so we just await it
                await _process_job(job_id, storage_mock)
            
        # Re-fetch the job using a fresh session to bypass REPEATABLE READ isolation
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as read_session:
            updated_job = await read_session.get(CatalogExtractionJob, job_id)
        
        assert updated_job.status == "FAILED"
        assert "Corrupt PDF" in updated_job.error_details
        from app.worker.job_runner import MAX_RETRIES
        assert updated_job.retry_count == MAX_RETRIES


class TestF09LatestExtractionRecord:
    @pytest.mark.asyncio
    async def test_latest_ai_extraction_record(self, db_session: AsyncSession, vendor_a_p3b):
        from app.services.extraction import ExtractionService
        
        _, _, org = vendor_a_p3b
        job, doc_ver = await _create_job_and_doc_in_db(org.id, db_session)
        job.status = "COMPLETED"
        await db_session.commit()
        
        # Insert two AIExtractionRecords for this job
        import asyncio
        from app.models.extraction import AIExtractionRecord
        
        r1 = AIExtractionRecord(
            job_id=job.id,
            vendor_organization_id=org.id,
            catalog_id=job.catalog_id,
            document_version_id=doc_ver.id,
            raw_json_snippet="old",
            model_provider_info="test",
        )
        db_session.add(r1)
        await db_session.commit()
        
        await asyncio.sleep(1) # Ensure time difference
        
        r2 = AIExtractionRecord(
            job_id=job.id,
            vendor_organization_id=org.id,
            catalog_id=job.catalog_id,
            document_version_id=doc_ver.id,
            raw_json_snippet="new",
            model_provider_info="test",
        )
        db_session.add(r2)
        await db_session.commit()
        
        svc = ExtractionService(db_session)
        latest = await svc.get_latest_ai_extraction_record(org.id, job.catalog_id, job.id)
        
        assert latest is not None
        assert latest.id == r2.id
        assert latest.raw_json_snippet == "new"
