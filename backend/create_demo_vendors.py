import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.vendor import VendorOrganization
from app.models.user import User, Role
from app.core.security import get_password_hash
import uuid

async def create_demo_vendors():
    vendors = [
        "WILSON",
        "VAYU PRODUCTS PVT. LTD",
        "SHAKTI GROUP",
        "LINDE",
        "INOX",
        "AIR LIQUIDE"
    ]

    async with AsyncSessionLocal() as session:
        # Check if VENDOR role exists
        result = await session.execute(select(Role).where(Role.name == "VENDOR"))
        vendor_role = result.scalar_one_or_none()
        if not vendor_role:
            vendor_role = Role(id=str(uuid.uuid4()), name="VENDOR", description="Vendor Role")
            session.add(vendor_role)
            await session.commit()
            await session.refresh(vendor_role)

        for vendor_name in vendors:
            # Check if vendor exists
            result = await session.execute(select(VendorOrganization).where(VendorOrganization.legal_name == vendor_name))
            existing_vendor = result.scalar_one_or_none()
            
            if not existing_vendor:
                vendor_id = str(uuid.uuid4())
                vendor_org = VendorOrganization(
                    id=vendor_id,
                    legal_name=vendor_name,
                    status="APPROVED",
                    verification_status="VERIFIED"
                )
                session.add(vendor_org)
                
                # Create user for this vendor
                email = f"{vendor_name.lower().replace(' ', '').replace('.', '')}@demo.com"
                user_id = str(uuid.uuid4())
                
                user = User(
                    id=user_id,
                    email=email,
                    password_hash=get_password_hash("password123"),
                    full_name=f"{vendor_name} Contact",
                    is_active=True,
                    is_verified=True,
                    vendor_organization_id=vendor_id
                )
                user.roles.append(vendor_role)
                session.add(user)
                
                print(f"Created vendor: {vendor_name} with email: {email} and password: password123")
            else:
                print(f"Vendor {vendor_name} already exists.")
                
        await session.commit()
        print("Done creating demo vendors.")

if __name__ == "__main__":
    asyncio.run(create_demo_vendors())
