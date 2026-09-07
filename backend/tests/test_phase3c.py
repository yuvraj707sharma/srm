import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
import pytest_asyncio
from app.models.vendor import VendorOrganization

from app.models.extraction import CatalogExtractionJob, AIExtractionRecord, CatalogProductDraft

@pytest_asyncio.fixture
async def vendor_a(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_a_p3c@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor A Corp P3C",
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
    user, token = await create_test_user(email="vendor_b_p3c@test.com", roles=["VENDOR"])
    org = VendorOrganization(
        legal_name="Vendor B Corp P3C",
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
async def setup_draft_data(async_client, vendor_a, db_session):
    _, token, vendor_org = vendor_a
    vendor_auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. Upload doc
    with open("tests/fixtures/sample.pdf", "rb") as f:
        doc_resp = await async_client.post(
            "/api/v1/vendor/documents",
            params={"document_type": "CATALOG"},
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers=vendor_auth_headers
        )
    doc_ver_id = doc_resp.json()["version_id"]

    # 2. Create catalog
    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json={"title": "Draft Review Test Catalog", "document_version_id": doc_ver_id},
        headers=vendor_auth_headers
    )
    catalog_id = cat_resp.json()["id"]

    # 3. Create job
    extract_resp = await async_client.post(
        f"/api/v1/vendor/catalogs/{catalog_id}/extract",
        headers=vendor_auth_headers
    )
    job_id = extract_resp.json()["job_id"]

    # 4. Mock job completion and create draft
    await db_session.execute(
        update(CatalogExtractionJob)
        .where(CatalogExtractionJob.id == job_id)
        .values(status="COMPLETED")
    )
    
    draft = CatalogProductDraft(
        vendor_organization_id=vendor_org.id,
        catalog_id=catalog_id,
        document_version_id=doc_ver_id,
        product_name="AI Extracted Product",
        attributes_json="{\"key\":\"value\"}",
        status="NEEDS_REVIEW"
    )
    db_session.add(draft)
    await db_session.flush()

    record = AIExtractionRecord(
        job_id=job_id,
        product_draft_id=draft.id,
        vendor_organization_id=vendor_org.id,
        catalog_id=catalog_id,
        document_version_id=doc_ver_id,
        raw_json_snippet="{}"
    )
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(draft)

    return {
        "vendor_headers": vendor_auth_headers,
        "catalog_id": catalog_id,
        "job_id": job_id,
        "draft_id": draft.id,
        "vendor_org": vendor_org
    }

@pytest.mark.asyncio
async def test_vendor_cannot_get_other_vendor_draft(async_client: AsyncClient, setup_draft_data, vendor_b):
    _, token_b, _ = vendor_b
    headers_b = {"Authorization": f"Bearer {token_b}"}
    draft_id = setup_draft_data["draft_id"]

    resp = await async_client.get(f"/api/v1/vendor/catalogs/drafts/{draft_id}", headers=headers_b)
    assert resp.status_code == 404

@pytest.mark.asyncio
async def test_vendor_cannot_edit_other_vendor_draft(async_client: AsyncClient, setup_draft_data, vendor_b):
    _, token_b, _ = vendor_b
    headers_b = {"Authorization": f"Bearer {token_b}"}
    draft_id = setup_draft_data["draft_id"]

    resp = await async_client.patch(
        f"/api/v1/vendor/catalogs/drafts/{draft_id}",
        json={"product_name": "Hacked", "attributes": {}},
        headers=headers_b
    )
    assert resp.status_code == 409 # Conflict because 0 rows updated

@pytest.mark.asyncio
async def test_needs_review_draft_can_be_edited(async_client: AsyncClient, setup_draft_data):
    headers = setup_draft_data["vendor_headers"]
    draft_id = setup_draft_data["draft_id"]

    resp = await async_client.patch(
        f"/api/v1/vendor/catalogs/drafts/{draft_id}",
        json={"product_name": "Corrected Name", "attributes": {"new": "val"}},
        headers=headers
    )
    assert resp.status_code == 200

    resp2 = await async_client.get(f"/api/v1/vendor/catalogs/drafts/{draft_id}", headers=headers)
    assert resp2.json()["product_name"] == "Corrected Name"
    assert resp2.json()["attributes"] == '{"new": "val"}'

@pytest.mark.asyncio
async def test_needs_review_draft_can_be_approved(async_client: AsyncClient, setup_draft_data):
    headers = setup_draft_data["vendor_headers"]
    draft_id = setup_draft_data["draft_id"]

    resp = await async_client.post(
        f"/api/v1/vendor/catalogs/drafts/{draft_id}/approve",
        headers=headers
    )
    assert resp.status_code == 200
    
    # Check it cannot be edited now
    resp_patch = await async_client.patch(
        f"/api/v1/vendor/catalogs/drafts/{draft_id}",
        json={"product_name": "Hacked", "attributes": {}},
        headers=headers
    )
    assert resp_patch.status_code == 409

@pytest.mark.asyncio
async def test_needs_review_draft_can_be_rejected(async_client: AsyncClient, setup_draft_data):
    headers = setup_draft_data["vendor_headers"]
    draft_id = setup_draft_data["draft_id"]

    resp = await async_client.post(
        f"/api/v1/vendor/catalogs/drafts/{draft_id}/reject",
        json={"reason": "Incorrect extraction"},
        headers=headers
    )
    assert resp.status_code == 200
    
    resp2 = await async_client.get(f"/api/v1/vendor/catalogs/drafts/{draft_id}", headers=headers)
    assert resp2.json()["status"] == "REJECTED"
    assert resp2.json()["rejection_reason"] == "Incorrect extraction"

@pytest.mark.asyncio
async def test_concurrent_approve_reject_only_one_succeeds(async_client: AsyncClient, setup_draft_data):
    headers = setup_draft_data["vendor_headers"]
    draft_id = setup_draft_data["draft_id"]

    # Trigger both concurrently
    results = await asyncio.gather(
        async_client.post(f"/api/v1/vendor/catalogs/drafts/{draft_id}/approve", headers=headers),
        async_client.post(f"/api/v1/vendor/catalogs/drafts/{draft_id}/reject", json={"reason": "conflict"}, headers=headers)
    )

    statuses = [r.status_code for r in results]
    assert 200 in statuses
    assert 409 in statuses
