import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User, Role, Permission
from app.models.vendor import VendorOrganization
from app.core.security import get_password_hash
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

async def seed():
    async with AsyncSessionLocal() as db:
        # 1. Seed Permissions
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

        # 2. Seed Roles
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

        # 3. Check if vendor org exists
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

        # 4. Seed / Update Vendor User
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

        # 5. Seed / Update Admin User
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

