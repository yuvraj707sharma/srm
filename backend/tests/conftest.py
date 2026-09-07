import pytest
import pytest_asyncio
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload

from app.main import app
from app.db.session import engine, AsyncSessionLocal
from app.models.user import User, Role, Permission
from app.core.security import get_password_hash


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: sync_conn.execute(text("SET FOREIGN_KEY_CHECKS=0;")))
        for table in [
            "recommendation_results", "recommendation_requests",
            "catalog_embedding_jobs",
            "catalog_product_drafts", "ai_extraction_records", "catalog_extraction_jobs",
            "question_response_documents", "question_responses", "questionnaire_responses", "questions",
            "questionnaire_template_versions", "questionnaire_templates", "document_versions", "documents",
            "catalog_records", "vendor_contacts", "role_permissions", "user_roles", "refresh_tokens",
            "audit_events", "permissions", "roles", "users", "vendor_organizations"
        ]:
            await conn.execute(text(f"DELETE FROM {table};"))
        await conn.run_sync(lambda sync_conn: sync_conn.execute(text("SET FOREIGN_KEY_CHECKS=1;")))
        
    async with AsyncSessionLocal() as session:
        # Pre-seed standard permissions and roles for test isolation
        p_read = Permission(name="users.read", description="Read users")
        p_approve = Permission(name="vendors.approve", description="Approve vendors")
        p_read_all = Permission(name="vendors.read_all", description="Read all vendors")
        
        r_admin = Role(name="ADMIN", description="Administrator")
        r_admin.permissions = [p_read, p_approve, p_read_all]
        
        r_proc_admin = Role(name="Procurement Admin", description="Procurement Admin")
        r_proc_admin.permissions = [p_read, p_approve, p_read_all]
        
        r_vendor = Role(name="VENDOR", description="Vendor")
        
        session.add_all([p_read, p_approve, p_read_all, r_admin, r_proc_admin, r_vendor])
        await session.commit()

        yield session
        # session.close() is automatically called by the context manager exit



@pytest_asyncio.fixture(scope="function")
async def db(db_session):
    yield db_session


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def create_test_user(db_session: AsyncSession):
    async def _create(email: str = "admin@test.com", password: str = "password123", roles: list[str] = ["ADMIN"]):
        user = User(
            email=email,
            password_hash=get_password_hash(password),
            full_name="Test User",
            is_active=True,
            is_verified=True
        )
        
        stmt = select(Role).options(selectinload(Role.permissions)).where(Role.name.in_(roles))
        res = await db_session.execute(stmt)
        user.roles = list(res.scalars().all())
            
        db_session.add(user)
        await db_session.commit()
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login_resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
            return user, login_resp.json().get("access_token")
    return _create


@pytest_asyncio.fixture
async def setup_test_user(db_session: AsyncSession, create_test_user):
    user, _ = await create_test_user("admin@test.com", "password123", ["ADMIN"])
    return user
