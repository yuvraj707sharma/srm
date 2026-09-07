import asyncio
import os
import urllib.parse
from app.core.config import settings
from app.db.session import engine, AsyncSessionLocal
from app.db.base import Base
import app.models  # Ensure all models are imported so Base.metadata has them
from app.models.user import User, Role, Permission
from app.models.vendor import VendorOrganization
from app.core.security import get_password_hash
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import pymysql

def init_database():
    """
    Ensures the MySQL database exists before SQLAlchemy attempts async connection.
    """
    parsed = urllib.parse.urlparse(settings.DATABASE_URL.replace("mysql+aiomysql://", "mysql://"))
    user = parsed.username or "root"
    password = urllib.parse.unquote(parsed.password or "")
    host = parsed.hostname or "localhost"
    port = parsed.port or 3306
    db_name = parsed.path.lstrip("/") or "jecrc_scm"

    print(f"Connecting to MySQL server at {host}:{port} to ensure database '{db_name}' exists...")
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        charset="utf8mb4"
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        conn.commit()
        print(f"Database '{db_name}' is ready.")
    finally:
        conn.close()

async def seed():
    # 1. Ensure database exists
    init_database()

    # 2. Create all tables automatically
    print("Creating all tables in database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully.")

    # 3. Seed Permissions & Roles
    async with AsyncSessionLocal() as db:
        perm_names = ["users.read", "vendors.read", "vendors.read_all", "vendors.approve"]
        perms_dict = {}
        for pname in perm_names:
            res = await db.execute(select(Permission).where(Permission.name == pname))
            p = res.scalars().first()
            if not p:
                p = Permission(name=pname, description=f"{pname} permission")
                db.add(p)
                await db.flush()
            perms_dict[pname] = p

        res = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.name == "VENDOR"))
        vendor_role = res.scalars().first()
        if not vendor_role:
            vendor_role = Role(name="VENDOR", description="Vendor")
            db.add(vendor_role)
            await db.flush()

        res = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.name == "ADMIN"))
        admin_role = res.scalars().first()
        if not admin_role:
            admin_role = Role(name="ADMIN", description="Administrator")
            db.add(admin_role)
            await db.flush()
        admin_role.permissions = list(perms_dict.values())

        res = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.name == "Procurement Admin"))
        proc_admin_role = res.scalars().first()
        if not proc_admin_role:
            proc_admin_role = Role(name="Procurement Admin", description="Procurement Admin")
            db.add(proc_admin_role)
            await db.flush()
        proc_admin_role.permissions = list(perms_dict.values())

        # Check vendor org
        res = await db.execute(select(VendorOrganization).where(VendorOrganization.legal_name == "Vendor A Test"))
        vendor_a_org = res.scalars().first()
        if not vendor_a_org:
            vendor_a_org = VendorOrganization(
                legal_name="Vendor A Test",
                organization_type="Private",
                country="India",
                status="APPROVED",
                verification_status="VERIFIED"
            )
            db.add(vendor_a_org)
            await db.flush()
        else:
            vendor_a_org.status = "APPROVED"
            vendor_a_org.verification_status = "VERIFIED"

        # Vendor User
        res = await db.execute(select(User).options(selectinload(User.roles)).where(User.email == "vendor_a@test.com"))
        user = res.scalars().first()
        if not user:
            user = User(
                email="vendor_a@test.com",
                password_hash=get_password_hash("password123"),
                full_name="Vendor A",
                is_active=True,
                is_verified=True,
                vendor_organization_id=vendor_a_org.id
            )
            db.add(user)
            await db.flush()
        else:
            user.password_hash = get_password_hash("password123")
            user.is_active = True
            user.is_verified = True
            user.vendor_organization_id = vendor_a_org.id

        if vendor_role not in user.roles:
            user.roles.append(vendor_role)

        # Admin User
        res = await db.execute(select(User).options(selectinload(User.roles)).where(User.email == "admin@test.com"))
        admin_user = res.scalars().first()
        if not admin_user:
            admin_user = User(
                email="admin@test.com",
                password_hash=get_password_hash("password123"),
                full_name="System Admin",
                is_active=True,
                is_verified=True,
                vendor_organization_id=None
            )
            db.add(admin_user)
            await db.flush()
        else:
            admin_user.password_hash = get_password_hash("password123")
            admin_user.is_active = True
            admin_user.is_verified = True

        for r in [admin_role, proc_admin_role]:
            if r not in admin_user.roles:
                admin_user.roles.append(r)

        await db.commit()
        print("Successfully seeded users and permissions:")
        print(" - admin@test.com / password123 (Roles: ADMIN, Procurement Admin)")
        print(" - vendor_a@test.com / password123 (Role: VENDOR, Org: Vendor A Test [APPROVED])")

if __name__ == "__main__":
    asyncio.run(seed())
