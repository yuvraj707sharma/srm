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
            admin_role = Role(name="ADMIN", description="Administrator", permissions=list(perms_dict.values()))
            db.add(admin_role)
            await db.flush()
        else:
            admin_role.permissions = list(perms_dict.values())

        res = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.name == "Procurement Admin"))
        proc_admin_role = res.scalars().first()
        if not proc_admin_role:
            proc_admin_role = Role(name="Procurement Admin", description="Procurement Admin", permissions=list(perms_dict.values()))
            db.add(proc_admin_role)
            await db.flush()
        else:
            proc_admin_role.permissions = list(perms_dict.values())

        # Seed Vendor Organizations & Accounts
        vendors_to_seed = [
            {
                "email": "inox@test.com",
                "name": "Akash (Inox Air Products)",
                "org_name": "Inox Air Products Pvt Ltd",
                "phone": "+91 9999596836",
            },
            {
                "email": "linde@test.com",
                "name": "Hardeep Singh (Linde India)",
                "org_name": "Linde India Ltd",
                "phone": "+91 9878219520",
            },
            {
                "email": "wilson@test.com",
                "name": "Utkarsh (Wilson Gases)",
                "org_name": "Wilson Gases & Healthcare",
                "phone": "+91 8385058000",
            },
            {
                "email": "vendor_a@test.com",
                "name": "Test Vendor",
                "org_name": "Vendor A Test",
                "phone": "+91 9876543210",
            }
        ]

        for vinfo in vendors_to_seed:
            res = await db.execute(select(VendorOrganization).where(VendorOrganization.legal_name == vinfo["org_name"]))
            org = res.scalars().first()
            if not org:
                org = VendorOrganization(
                    legal_name=vinfo["org_name"],
                    trade_name=vinfo["org_name"],
                    organization_type="Private Limited",
                    country="India",
                    status="APPROVED",
                    verification_status="VERIFIED"
                )
                db.add(org)
                await db.flush()
            else:
                org.status = "APPROVED"
                org.verification_status = "VERIFIED"

            res = await db.execute(select(User).options(selectinload(User.roles)).where(User.email == vinfo["email"]))
            u = res.scalars().first()
            if not u:
                u = User(
                    email=vinfo["email"],
                    password_hash=get_password_hash("password123"),
                    full_name=vinfo["name"],
                    phone=vinfo["phone"],
                    is_active=True,
                    is_verified=True,
                    vendor_organization_id=org.id,
                    roles=[vendor_role]
                )
                db.add(u)
                await db.flush()
            else:
                u.password_hash = get_password_hash("password123")
                u.is_active = True
                u.is_verified = True
                u.vendor_organization_id = org.id
                u.phone = vinfo["phone"]
                if vendor_role not in u.roles:
                    u.roles.append(vendor_role)

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
                vendor_organization_id=None,
                roles=[admin_role, proc_admin_role]
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
        for vinfo in vendors_to_seed:
            print(f" - {vinfo['email']} / password123 (Role: VENDOR, Org: {vinfo['org_name']} [APPROVED])")

if __name__ == "__main__":
    asyncio.run(seed())

