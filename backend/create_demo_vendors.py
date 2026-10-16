import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import AsyncSessionLocal
from app.models.vendor import VendorOrganization
from app.models.user import User, Role
from app.core.security import get_password_hash
import uuid

DEMO_VENDORS = [
    {
        "email": "inox@demo.com",
        "alt_email": "inox@test.com",
        "name": "Siddharth Sharma",
        "org_name": "INOX Air Products Private Limited",
        "trade_name": "INOX Air Products",
        "vendor_code": "VEND-INOX-01",
        "phone": "+91 98290 11111",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pan": "AAACI1234F",
        "gstin": "27AAACI1234F1Z5",
        "specialty": "Liquid Medical Oxygen (LMO), Bulk Cryogenic Storage Tanks"
    },
    {
        "email": "linde@demo.com",
        "alt_email": "linde@test.com",
        "name": "Rajesh Verma",
        "org_name": "Linde India Limited",
        "trade_name": "Linde Healthcare",
        "vendor_code": "VEND-LINDE-02",
        "phone": "+91 98290 22222",
        "city": "Kolkata",
        "state": "West Bengal",
        "pan": "AAACL5678G",
        "gstin": "19AAACL5678G1Z2",
        "specialty": "Cryogenic Tanks, Ambient Vaporizers, Medical Gas Pipelines"
    },
    {
        "email": "airliquide@demo.com",
        "alt_email": "airliquide@test.com",
        "name": "Amitabh Roy",
        "org_name": "Air Liquide India Holding Private Limited",
        "trade_name": "Air Liquide Healthcare",
        "vendor_code": "VEND-AIRLIQ-03",
        "phone": "+91 98290 33333",
        "city": "Gurugram",
        "state": "Haryana",
        "pan": "AAACA9012H",
        "gstin": "06AAACA9012H1Z8",
        "specialty": "Hospital LMO Systems, Cryogenic Equipment, Turnkey SITC"
    },
    {
        "email": "vayu@demo.com",
        "alt_email": "vayu@test.com",
        "name": "Vikas Meena",
        "org_name": "Vayu Products Private Limited",
        "trade_name": "Vayu Medical Cryogenics",
        "vendor_code": "VEND-VAYU-04",
        "phone": "+91 98290 44444",
        "city": "Jaipur",
        "state": "Rajasthan",
        "pan": "AAACV3456J",
        "gstin": "08AAACV3456J1Z1",
        "specialty": "Local Rajasthan Medical Oxygen Supply & Maintenance"
    },
    {
        "email": "shakti@demo.com",
        "alt_email": "shakti@test.com",
        "name": "Pradeep Agarwal",
        "org_name": "Shakti Cryogenics Private Limited",
        "trade_name": "Shakti Gas Systems",
        "vendor_code": "VEND-SHAKTI-05",
        "phone": "+91 98290 55555",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pan": "AAACS7890K",
        "gstin": "24AAACS7890K1Z4",
        "specialty": "Vaporizers, Pressure Regulating Skids & Manifolds"
    }
]

async def create_demo_vendors():
    async with AsyncSessionLocal() as session:
        # 1. Ensure Roles
        res_v = await session.execute(select(Role).where(Role.name == "VENDOR"))
        vendor_role = res_v.scalar_one_or_none()
        if not vendor_role:
            vendor_role = Role(id=str(uuid.uuid4()), name="VENDOR", description="Vendor Organization Role")
            session.add(vendor_role)
            await session.commit()
            await session.refresh(vendor_role)

        res_a = await session.execute(select(Role).where(Role.name == "ADMIN"))
        admin_role = res_a.scalar_one_or_none()
        if not admin_role:
            admin_role = Role(id=str(uuid.uuid4()), name="ADMIN", description="System Administrator")
            session.add(admin_role)
            await session.commit()
            await session.refresh(admin_role)

        print("\n========================================================")
        print("          SEEDING 5 DEMO VENDORS & ADMIN                ")
        print("========================================================")

        for v in DEMO_VENDORS:
            # Check if vendor org exists
            stmt = select(VendorOrganization).where(
                (VendorOrganization.legal_name == v["org_name"]) |
                (VendorOrganization.vendor_code == v["vendor_code"])
            )
            res = await session.execute(stmt)
            org = res.scalars().first()

            if not org:
                org_id = str(uuid.uuid4())
                org = VendorOrganization(
                    id=org_id,
                    legal_name=v["org_name"],
                    trade_name=v["trade_name"],
                    display_name=v["trade_name"],
                    vendor_code=v["vendor_code"],
                    organization_type="Private Limited",
                    city=v["city"],
                    state_province=v["state"],
                    country="India",
                    primary_email=v["email"],
                    primary_phone=v["phone"],
                    pan_number=v["pan"],
                    gstin=v["gstin"],
                    status="APPROVED",
                    verification_status="VERIFIED"
                )
                session.add(org)
                await session.flush()
                print(f"[+] Created Vendor Org: {v['org_name']} ({v['vendor_code']})")
            else:
                org.status = "APPROVED"
                org.verification_status = "VERIFIED"
                org.trade_name = v["trade_name"]
                org.display_name = v["trade_name"]
                print(f"[✓] Updated Vendor Org: {v['org_name']} (Status: APPROVED)")

            # Create/Update Users for both primary email and alt email
            for em in [v["email"], v.get("alt_email")]:
                if not em:
                    continue
                res_u = await session.execute(select(User).options(selectinload(User.roles)).where(User.email == em))
                user = res_u.scalars().first()

                if not user:
                    user = User(
                        id=str(uuid.uuid4()),
                        email=em,
                        password_hash=get_password_hash("password123"),
                        full_name=v["name"],
                        phone=v["phone"],
                        is_active=True,
                        is_verified=True,
                        vendor_organization_id=org.id,
                        roles=[vendor_role]
                    )
                    session.add(user)
                    await session.flush()
                    print(f"    -> Created User: {em} | Password: password123")
                else:
                    user.password_hash = get_password_hash("password123")
                    user.is_active = True
                    user.is_verified = True
                    user.vendor_organization_id = org.id
                    if vendor_role not in user.roles:
                        user.roles.append(vendor_role)
                    print(f"    -> Refreshed User: {em} | Password: password123")

        # Admin User
        for a_email in ["admin@test.com", "admin@srm.com"]:
            res_a = await session.execute(select(User).options(selectinload(User.roles)).where(User.email == a_email))
            adm = res_a.scalars().first()
            if not adm:
                adm = User(
                    id=str(uuid.uuid4()),
                    email=a_email,
                    password_hash=get_password_hash("password123"),
                    full_name="Procurement Administrator",
                    is_active=True,
                    is_verified=True,
                    vendor_organization_id=None,
                    roles=[admin_role]
                )
                session.add(adm)
                print(f"[+] Created Admin: {a_email} | Password: password123")
            else:
                adm.password_hash = get_password_hash("password123")
                adm.is_active = True
                adm.is_verified = True
                if admin_role not in adm.roles:
                    adm.roles.append(admin_role)
                print(f"[✓] Refreshed Admin: {a_email} | Password: password123")

        await session.commit()
        print("\n========================================================")
        print("✓ All 5 Demo Vendors + Admin successfully seeded!")
        print("Default Password for all: password123")
        print("========================================================\n")

if __name__ == "__main__":
    asyncio.run(create_demo_vendors())
