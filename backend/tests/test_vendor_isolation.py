import pytest
import pytest_asyncio
import io
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.vendor import VendorOrganization
from app.models.document import Document, DocumentVersion

@pytest_asyncio.fixture
async def vendor_a(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_a@example.com", roles=["VENDOR"])
    org = VendorOrganization(legal_name="Vendor A Inc", organization_type="LLC", status="DRAFT", verification_status="UNVERIFIED")
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org

@pytest_asyncio.fixture
async def vendor_b(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_b@example.com", roles=["VENDOR"])
    org = VendorOrganization(legal_name="Vendor B LLC", organization_type="LLC", status="DRAFT", verification_status="UNVERIFIED")
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org

@pytest.mark.asyncio
async def test_vendor_isolation_profile_read(async_client: AsyncClient, vendor_a, vendor_b):
    _, token_a, org_a = vendor_a
    _, token_b, org_b = vendor_b
    
    # Vendor A accesses its own profile
    response = await async_client.get("/api/v1/vendor/me", headers={"Authorization": f"Bearer {token_a}"})
    assert response.status_code == 200
    assert response.json()["id"] == org_a.id
    assert response.json()["legal_name"] == "Vendor A Inc"

@pytest.mark.asyncio
async def test_vendor_isolation_forged_organization_id(async_client: AsyncClient, vendor_a, vendor_b):
    user_a, token_a, org_a = vendor_a
    _, _, org_b = vendor_b
    
    payload = {"legal_name": "Vendor A Renamed", "vendor_organization_id": org_b.id}
    response = await async_client.patch("/api/v1/vendor/me", json=payload, headers={"Authorization": f"Bearer {token_a}"})
    assert response.status_code == 200
    
    response_b = await async_client.get("/api/v1/vendor/me", headers={"Authorization": f"Bearer {vendor_b[1]}"})
    assert response_b.json()["legal_name"] == "Vendor B LLC"
    
    response_a = await async_client.get("/api/v1/vendor/me", headers={"Authorization": f"Bearer {token_a}"})
    assert response_a.json()["legal_name"] == "Vendor A Renamed"


@pytest.mark.asyncio
async def test_vendor_document_upload_and_isolation(async_client: AsyncClient, vendor_a, vendor_b):
    user_a, token_a, org_a = vendor_a
    user_b, token_b, org_b = vendor_b
    
    # Vendor A uploads a document
    file_content = b"fake pdf content"
    files = {"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")}
    
    response = await async_client.post(
        "/api/v1/vendor/documents?document_type=REGISTRATION", 
        files=files, 
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert response.status_code == 200
    doc_id = response.json()["document_id"]
    
    # Vendor B tries to upload a new version to Vendor A's document
    files_b = {"file": ("test2.pdf", io.BytesIO(file_content), "application/pdf")}
    response_b = await async_client.post(
        f"/api/v1/vendor/documents?document_type=REGISTRATION&document_id={doc_id}", 
        files=files_b, 
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert response_b.status_code == 404
    assert response_b.json()["error"]["message"] == "Document not found or unauthorized."


@pytest.mark.asyncio
async def test_vendor_unauthorized_self_approval(async_client: AsyncClient, vendor_a):
    _, token_a, org_a = vendor_a
    
    # Vendor A tries to use the admin verify endpoint
    response = await async_client.post(
        f"/api/v1/admin/vendors/{org_a.id}/verify?action=approve", 
        headers={"Authorization": f"Bearer {token_a}"}
    )
    # Fails because vendor lacks the "vendors.approve" permission
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_vendor_verification(async_client: AsyncClient, db_session: AsyncSession, create_test_user, vendor_a):
    # Create an admin user
    admin_user, admin_token = await create_test_user(email="admin@example.com", roles=["Procurement Admin"])
    
    _, _, org_a = vendor_a
    
    # Admin approves Vendor A (fails because it's DRAFT)
    response = await async_client.post(
        f"/api/v1/admin/vendors/{org_a.id}/verify?action=approve", 
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 400
    
    # Vendor profile moves to SUBMITTED
    org_a.status = "SUBMITTED"
    await db_session.commit()
    
    # Admin approves Vendor A
    response = await async_client.post(
        f"/api/v1/admin/vendors/{org_a.id}/verify?action=approve", 
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["vendor_status"] == "APPROVED"
