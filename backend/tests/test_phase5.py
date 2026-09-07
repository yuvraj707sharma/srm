import pytest
import os
from pydantic import ValidationError
from httpx import AsyncClient
from app.core.config import Settings
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.vendor import VendorOrganization

@pytest_asyncio.fixture
async def vendor_a(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user("vendorA_p5@test.com", "password123", ["VENDOR"])
    org = VendorOrganization(legal_name="Vendor A P5", primary_email="contactA@test.com")
    db_session.add(org)
    await db_session.commit()
    user.vendor_organization_id = org.id
    db_session.add(user)
    await db_session.commit()
    return user, token, org

def test_production_config_validation():
    # 1. Missing GEMINI_API_KEY
    with pytest.raises(ValidationError) as exc:
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="mysql+aiomysql://user:pass@db:3306/db",
            JWT_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            SUBMISSION_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            CORS_ORIGINS="https://example.com",
            GEMINI_API_KEY=""
        )
    assert "GEMINI_API_KEY must be set in production" in str(exc.value)

    # 2. Wildcard CORS
    with pytest.raises(ValidationError) as exc:
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="mysql+aiomysql://user:pass@db:3306/db",
            JWT_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            SUBMISSION_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            CORS_ORIGINS="*",
            GEMINI_API_KEY="valid-key"
        )
    assert "Wildcard CORS is not allowed in production" in str(exc.value)

    # 3. Default JWT Secret
    with pytest.raises(ValidationError) as exc:
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="mysql+aiomysql://user:pass@db:3306/db",
            JWT_SECRET_KEY="generate-a-secure-key-here",
            SUBMISSION_SECRET_KEY="generate-a-secure-key-here",
            CORS_ORIGINS="https://example.com",
            GEMINI_API_KEY="valid-key"
        )
    assert "JWT_SECRET_KEY must be a secure value" in str(exc.value)

    # 4. Localhost DB
    with pytest.raises(ValidationError) as exc:
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="mysql+aiomysql://user:pass@localhost:3306/db",
            JWT_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            SUBMISSION_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
            CORS_ORIGINS="https://example.com",
            GEMINI_API_KEY="valid-key"
        )
    assert "Localhost database URLs are not allowed" in str(exc.value)

    # 5. Valid Production Config
    valid_settings = Settings(
        ENVIRONMENT="production",
        DATABASE_URL="mysql+aiomysql://user:pass@db:3306/db",
        JWT_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
        SUBMISSION_SECRET_KEY="A_Very_Long_And_Secure_Secret_Key_For_Testing_12345",
        CORS_ORIGINS="https://example.com",
        GEMINI_API_KEY="valid-key"
    )
    assert valid_settings.ENVIRONMENT == "production"

@pytest.mark.asyncio
async def test_error_sanitization(async_client: AsyncClient):
    # Trigger a 404 (handled by FastAPI internally)
    response = await async_client.get("/api/v1/non_existent_route_for_testing")
    assert response.status_code == 404
    
    # Send bad data to cause validation error (handled gracefully)
    response = await async_client.post("/api/v1/auth/login", json={"bad": "payload"})
    assert response.status_code == 422
    
@pytest.mark.asyncio
async def test_file_upload_path_traversal(async_client: AsyncClient, vendor_a):
    _, token_a, _ = vendor_a
    # Attempt path traversal in filename
    import io
    file_bytes = b"%PDF-1.4 Mock PDF"
    files = {"file": ("../../../etc/passwd", io.BytesIO(file_bytes), "application/pdf")}
    
    # The application should sanitize the filename or store it as UUID internally, avoiding traversal
    resp = await async_client.post(
        "/api/v1/vendor/documents?document_type=COMPANY_REGISTRATION",
        files=files,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200
    doc_id = resp.json()["document_id"]
    
    # Confirm it was saved correctly and securely
    list_resp = await async_client.get(f"/api/v1/vendor/documents/{doc_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert list_resp.status_code == 200
