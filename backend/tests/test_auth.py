import pytest
from httpx import AsyncClient
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.main import app
from app.db.session import engine, AsyncSessionLocal
from app.models.user import User, Role, Permission
from app.core.security import get_password_hash

@pytest.mark.asyncio
async def test_valid_login(async_client, setup_test_user):
    response = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in response.cookies


@pytest.mark.asyncio
async def test_invalid_login_password(async_client, setup_test_user):
    response = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert "refresh_token" not in response.cookies


@pytest.mark.asyncio
async def test_account_lockout_after_failures(async_client, setup_test_user, db):
    # Fail 5 times
    for _ in range(5):
        resp = await async_client.post("/api/v1/auth/login", json={
            "email": "admin@test.com",
            "password": "wrongpassword"
        })
        assert resp.status_code == 401
        
    # 6th time should be locked out, even with right password
    response = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_LOCKED"


@pytest.mark.asyncio
async def test_get_me_protected(async_client, setup_test_user):
    # Login first
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    token = login_resp.json()["access_token"]
    
    # Get ME
    me_resp = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "admin@test.com"
    assert "ADMIN" in me_data["roles"]
    assert "users.read" in me_data["permissions"]
    assert "password_hash" not in me_data


@pytest.mark.asyncio
async def test_refresh_token_rotation(async_client, setup_test_user):
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    old_refresh_cookie = login_resp.cookies.get("refresh_token")
    
    # Refresh
    refresh_resp = await async_client.post("/api/v1/auth/refresh", cookies={"refresh_token": old_refresh_cookie})
    assert refresh_resp.status_code == 200
    new_refresh_cookie = refresh_resp.cookies.get("refresh_token")
    assert new_refresh_cookie != old_refresh_cookie
    # Not asserting access_token inequality because test runs < 1s and JWT exp claim truncates to seconds
    
    # Attempt replay with old token -> Should fail and revoke
    replay_resp = await async_client.post("/api/v1/auth/refresh", cookies={"refresh_token": old_refresh_cookie})
    assert replay_resp.status_code == 401
    
    # Attempt to use the new token after replay -> Should also fail (family revoked)
    new_use_resp = await async_client.post("/api/v1/auth/refresh", cookies={"refresh_token": new_refresh_cookie})
    assert new_use_resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(async_client, setup_test_user):
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    refresh_cookie = login_resp.cookies.get("refresh_token")
    
    logout_resp = await async_client.post("/api/v1/auth/logout", cookies={"refresh_token": refresh_cookie})
    assert logout_resp.status_code == 200
    
    # Verify cookie cleared (empty string)
    assert not logout_resp.cookies.get("refresh_token")
    
    # Ensure token is revoked
    refresh_resp = await async_client.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_vendor_organization_context_abstractions_rejected(async_client, setup_test_user):
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    token = login_resp.json()["access_token"]
    
    resp = await async_client.get("/api/v1/vendor/me?vendor_id=fake-vendor-123", headers={"Authorization": f"Bearer {token}"})
    
    # Because the setup_test_user has no vendor_organization_id, this must throw a 403 Forbidden.
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"
