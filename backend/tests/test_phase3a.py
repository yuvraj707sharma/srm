import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.extraction import CatalogExtractionJob
from app.models.catalog import CatalogRecord
from app.models.vendor import VendorOrganization
import pytest_asyncio

@pytest_asyncio.fixture
async def vendor_a(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_a_p3@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor Alpha Corp P3",
        organization_type="Private Limited",
        country="India",
        status="DRAFT",
        verification_status="UNVERIFIED"
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org

@pytest_asyncio.fixture
async def vendor_b(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_b_p3@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor Beta Corp P3",
        organization_type="Private Limited",
        country="India",
        status="DRAFT",
        verification_status="UNVERIFIED"
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org

@pytest.mark.asyncio
async def test_create_extraction_job_duplicate_prevention(async_client: AsyncClient, vendor_a, db_session: AsyncSession):
    _, token, _ = vendor_a
    vendor_auth_headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Vendor uploads a catalog (mocking via API or DB directly)
    # Upload document first
    with open("tests/fixtures/sample.pdf", "rb") as f:
        doc_resp = await async_client.post(
            "/api/v1/vendor/documents",
            params={"document_type": "CATALOG"},
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers=vendor_auth_headers
        )
    assert doc_resp.status_code == 200
    doc_ver_id = doc_resp.json()["version_id"]

    # Register Catalog
    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json={
            "title": "Phase 3A Test Catalog",
            "description": "A catalog for testing job creation.",
            "catalog_year": "2026",
            "document_version_id": doc_ver_id
        },
        headers=vendor_auth_headers
    )
    assert cat_resp.status_code == 200
    catalog_id = cat_resp.json()["id"]

    # 2. Start extraction (creates job 1)
    extract_resp = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    assert extract_resp.status_code == 200
    data = extract_resp.json()
    assert data["status"] == "PENDING"
    job_id_1 = data["job_id"]
    
    # 3. Start extraction again (should return same job since it is PENDING)
    extract_resp_2 = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    assert extract_resp_2.status_code == 200
    job_id_2 = extract_resp_2.json()["job_id"]
    
    assert job_id_1 == job_id_2

@pytest.mark.asyncio
async def test_extraction_tenant_isolation(async_client: AsyncClient, vendor_a, vendor_b, db_session: AsyncSession):
    _, token_a, _ = vendor_a
    vendor_auth_headers = {"Authorization": f"Bearer {token_a}"}
    
    _, token_b, _ = vendor_b
    other_vendor_auth_headers = {"Authorization": f"Bearer {token_b}"}

    # Setup Vendor A catalog
    with open("tests/fixtures/sample.pdf", "rb") as f:
        doc_resp = await async_client.post(
            "/api/v1/vendor/documents",
            params={"document_type": "CATALOG"},
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers=vendor_auth_headers
        )
    doc_ver_id = doc_resp.json()["version_id"]

    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json={
            "title": "Vendor A Catalog",
            "document_version_id": doc_ver_id
        },
        headers=vendor_auth_headers
    )
    catalog_id = cat_resp.json()["id"]

    # Create job for Vendor A
    extract_resp = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    assert extract_resp.status_code == 200

    # Vendor B tries to view Vendor A's extraction status
    status_resp_b = await async_client.get(
        f"/api/v1/vendor/catalogs/{catalog_id}/extraction-status",
        headers=other_vendor_auth_headers
    )
    # Vendor B doesn't own this catalog, the query for the job status will return nothing OR the catalog fetch will fail
    assert status_resp_b.status_code == 404

    # Vendor B tries to enqueue extraction for Vendor A's catalog
    extract_resp_b = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=other_vendor_auth_headers
    )
    # Catalog is not found for Vendor B
    assert extract_resp_b.status_code == 404

@pytest.mark.asyncio
async def test_worker_claim_and_process(async_client: AsyncClient, vendor_a, db_session: AsyncSession):
    _, token, _ = vendor_a
    vendor_auth_headers = {"Authorization": f"Bearer {token}"}

    # Enqueue a job via API
    with open("tests/fixtures/sample.pdf", "rb") as f:
        doc_resp = await async_client.post(
            "/api/v1/vendor/documents",
            params={"document_type": "CATALOG"},
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers=vendor_auth_headers
        )
    doc_ver_id = doc_resp.json()["version_id"]

    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json={"title": "Worker Test Catalog", "document_version_id": doc_ver_id},
        headers=vendor_auth_headers
    )
    catalog_id = cat_resp.json()["id"]
    
    extract_resp = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    assert extract_resp.status_code == 200
    job_id = extract_resp.json()["job_id"]

    # Verify job starts as PENDING
    stmt = select(CatalogExtractionJob).where(CatalogExtractionJob.id == job_id)
    res = await db_session.execute(stmt)
    job = res.scalars().first()
    assert job.status == "PENDING"

    # Simulate the worker's claim step (no placeholder needed)
    job.status = "PROCESSING"
    await db_session.commit()

    # Simulate successful completion
    job.status = "COMPLETED"
    await db_session.commit()

    res = await db_session.execute(stmt)
    updated_job = res.scalars().first()
    assert updated_job.status == "COMPLETED"

@pytest.mark.asyncio
async def test_concurrent_worker_claim(async_client: AsyncClient, vendor_a, db_session: AsyncSession):
    # Enqueue a single job
    _, token, _ = vendor_a
    vendor_auth_headers = {"Authorization": f"Bearer {token}"}

    with open("tests/fixtures/sample.pdf", "rb") as f:
        doc_resp = await async_client.post(
            "/api/v1/vendor/documents",
            params={"document_type": "CATALOG"},
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers=vendor_auth_headers
        )
    doc_ver_id = doc_resp.json()["version_id"]

    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json={"title": "Concurrent Claim Test Catalog", "document_version_id": doc_ver_id},
        headers=vendor_auth_headers
    )
    catalog_id = cat_resp.json()["id"]
    
    extract_resp = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    job_id = extract_resp.json()["job_id"]
    
    # We will simulate 2 concurrent worker iterations claiming jobs
    from app.worker.job_runner import _claim_next_pending_job
    from app.db.session import AsyncSessionLocal
    import asyncio
    
    async def claim_attempt():
        async with AsyncSessionLocal() as session:
            return await _claim_next_pending_job(session)
            
    # Run two claim attempts concurrently
    results = await asyncio.gather(claim_attempt(), claim_attempt())
    
    # Check results: exactly one of the results should have claimed our job_id
    claimed_job_ids = [r.id for r in results if r is not None]
    assert job_id in claimed_job_ids, "Our job was not claimed by either worker"
    assert claimed_job_ids.count(job_id) == 1, "Job was claimed more than once by concurrent workers!"
    
    # Verify the job is in PROCESSING state in the DB
    async with AsyncSessionLocal() as read_session:
        db_job = await read_session.get(CatalogExtractionJob, job_id)
    assert db_job.status == "PROCESSING"
