from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from app.db.session import get_db
from app.services.auth import AuthService
from app.api.deps import get_current_user
from app.models.user import User
from app.core.config import settings
from app.core.security import create_access_token

router = APIRouter()

from app.models.vendor import VendorOrganization
from app.models.user import User, Role, UserRole
from app.core.security import get_password_hash
from sqlalchemy import func

class RegisterVendorRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    legal_name: str
    organization_type: str = "Private Limited"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerifyRequest(BaseModel):
    email: EmailStr
    code: str

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    roles: list[str]
    permissions: list[str]


def _set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/api/v1/auth"
    )

def _clear_refresh_cookie(response: Response):
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/api/v1/auth"
    )

@router.post("/login", response_model=TokenResponse)
async def login(
    req_data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    auth_service = AuthService(db)
    user = await auth_service.authenticate_user(req_data.email, req_data.password, ip_address, user_agent)
    
    access_token = create_access_token(user.id)
    refresh_token = await auth_service.create_refresh_token(user.id, ip_address, user_agent)
    
    _set_refresh_cookie(response, refresh_token)
    return {"access_token": access_token}


@router.post("/request-otp")
async def request_otp(
    req_data: OTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    auth_service = AuthService(db)
    otp_code = await auth_service.request_otp(req_data.email, ip_address, user_agent)
    res = {"status": "otp_sent"}
    if settings.ENVIRONMENT != "production":
        res["dev_otp"] = otp_code
    return res


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    req_data: OTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    auth_service = AuthService(db)
    user = await auth_service.verify_otp(req_data.email, req_data.code, ip_address, user_agent)
    
    access_token = create_access_token(user.id)
    refresh_token = await auth_service.create_refresh_token(user.id, ip_address, user_agent)
    
    _set_refresh_cookie(response, refresh_token)
    return {"access_token": access_token}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    old_refresh_token = request.cookies.get("refresh_token")
    if not old_refresh_token:
        from app.core.exceptions import APIException
        raise APIException("UNAUTHORIZED", "No refresh token provided.", 401)
        
    auth_service = AuthService(db)
    new_refresh_token, user = await auth_service.rotate_refresh_token(old_refresh_token, ip_address, user_agent)
    
    access_token = create_access_token(user.id)
    _set_refresh_cookie(response, new_refresh_token)
    
    return {"access_token": access_token}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        auth_service = AuthService(db)
        await auth_service.logout(refresh_token, ip_address, user_agent)
        
    _clear_refresh_cookie(response)
    return {"status": "logged_out"}


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Returns safe profile information without revealing password hashes or secrets."""
    roles = [role.name for role in current_user.roles]
    permissions = []
    for role in current_user.roles:
        for perm in role.permissions:
            if perm.name not in permissions:
                permissions.append(perm.name)
                
    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        roles=roles,
        permissions=permissions
    )

from app.api.deps import get_current_vendor_context

@router.get("/vendor-context-test")
async def test_vendor_context(
    vendor_context=Depends(get_current_vendor_context)
):
    """Test endpoint to prove that vendor context comes from the server, not client params."""
    return {"status": "ok", "context": vendor_context}


@router.post("/register-vendor")
async def register_vendor(
    req_data: RegisterVendorRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    email = req_data.email.lower().strip()
    
    # 1. Check if user already exists
    from sqlalchemy import select
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    existing_user = res.scalar_one_or_none()
    if existing_user:
        if not existing_user.is_verified:
            # Re-send OTP for unverified user
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            auth_service = AuthService(db)
            otp_code = await auth_service.request_otp(email, ip_address, user_agent)
            resp = {
                "status": "otp_sent",
                "email": email,
                "message": "Account verification pending. A new 6-digit OTP has been sent to your email."
            }
            if settings.ENVIRONMENT != "production":
                resp["dev_otp"] = otp_code
            return resp
        else:
            from app.core.exceptions import APIException
            raise APIException("ALREADY_REGISTERED", "This email is already registered and verified. Please sign in to your account.", 400)
        
    # 2. Find or create VENDOR role
    role_stmt = select(Role).where(func.lower(Role.name) == "vendor")
    role_res = await db.execute(role_stmt)
    vendor_role = role_res.scalar_one_or_none()
    if not vendor_role:
        vendor_role = Role(name="VENDOR", description="Vendor")
        db.add(vendor_role)
        await db.flush()
        
    # 3. Create Vendor Organization
    vendor_org = VendorOrganization(
        legal_name=req_data.legal_name,
        organization_type=req_data.organization_type,
        status="DRAFT",
        verification_status="UNVERIFIED"
    )
    db.add(vendor_org)
    await db.flush()
    
    # 4. Create User (Unverified until OTP code is submitted)
    user = User(
        email=email,
        password_hash=get_password_hash(req_data.password),
        full_name=req_data.full_name,
        is_active=True,
        is_verified=False,
        vendor_organization_id=vendor_org.id
    )
    db.add(user)
    await db.flush()
    
    # 5. Attach VENDOR role
    db.add(UserRole(user_id=user.id, role_id=vendor_role.id))
    await db.commit()
    await db.refresh(user)
    
    # 6. Generate & Send OTP Code to Vendor Email
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    auth_service = AuthService(db)
    otp_code = await auth_service.request_otp(email, ip_address, user_agent)
    
    resp_data = {
        "status": "otp_sent",
        "email": email,
        "message": "Vendor account created. Please enter the 6-digit OTP sent to your email."
    }
    if settings.ENVIRONMENT != "production":
        resp_data["dev_otp"] = otp_code
    return resp_data


# -------------------------------------------------------------------------
# DEMO VENDORS SEEDING & CREDENTIALS ENDPOINTS
# -------------------------------------------------------------------------

DEMO_VENDORS_DATA = [
    {
        "id": "demo-vendor-1",
        "email": "inox@demo.com",
        "alt_email": "inox@test.com",
        "name": "Siddharth Sharma (INOX Gas Division)",
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
        "id": "demo-vendor-2",
        "email": "linde@demo.com",
        "alt_email": "linde@test.com",
        "name": "Rajesh Verma (Linde Healthcare)",
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
        "id": "demo-vendor-3",
        "email": "airliquide@demo.com",
        "alt_email": "airliquide@test.com",
        "name": "Amitabh Roy (Air Liquide Medical)",
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
        "id": "demo-vendor-4",
        "email": "vayu@demo.com",
        "alt_email": "vayu@test.com",
        "name": "Vikas Meena (Vayu Cryogenics)",
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
        "id": "demo-vendor-5",
        "email": "shakti@demo.com",
        "alt_email": "shakti@test.com",
        "name": "Pradeep Agarwal (Shakti Group)",
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


@router.get("/demo-vendors")
async def list_demo_vendors():
    """
    Returns available demo accounts for quick testing and quotation submission.
    """
    return {
        "admin": {
            "email": "admin@test.com",
            "password": "password123",
            "name": "Procurement Administrator",
            "role": "ADMIN"
        },
        "vendors": [
            {
                "email": v["email"],
                "password": "password123",
                "org_name": v["org_name"],
                "trade_name": v["trade_name"],
                "contact_person": v["name"],
                "phone": v["phone"],
                "specialty": v["specialty"]
            }
            for v in DEMO_VENDORS_DATA
        ]
    }


@router.post("/seed-demo-vendors")
async def seed_demo_vendors(db: AsyncSession = Depends(get_db)):
    """
    Idempotently seeds or refreshes the 5 demo vendor organizations and users,
    setting status='APPROVED' and password='password123', so quotations can be submitted.
    """
    from sqlalchemy.orm import selectinload
    import uuid

    # 1. Ensure Roles
    res_vrole = await db.execute(select(Role).where(Role.name == "VENDOR"))
    vendor_role = res_vrole.scalar_one_or_none()
    if not vendor_role:
        vendor_role = Role(name="VENDOR", description="Vendor Organization Role")
        db.add(vendor_role)
        await db.flush()

    res_arole = await db.execute(select(Role).where(Role.name == "ADMIN"))
    admin_role = res_arole.scalar_one_or_none()
    if not admin_role:
        admin_role = Role(name="ADMIN", description="System Administrator Role")
        db.add(admin_role)
        await db.flush()

    seeded_list = []

    # 2. Seed / Update 5 Demo Vendors
    for vinfo in DEMO_VENDORS_DATA:
        # Organization
        stmt_org = select(VendorOrganization).where(
            (VendorOrganization.legal_name == vinfo["org_name"]) |
            (VendorOrganization.vendor_code == vinfo["vendor_code"])
        )
        res_org = await db.execute(stmt_org)
        org = res_org.scalars().first()

        if not org:
            org = VendorOrganization(
                id=str(uuid.uuid4()),
                legal_name=vinfo["org_name"],
                trade_name=vinfo["trade_name"],
                display_name=vinfo["trade_name"],
                vendor_code=vinfo["vendor_code"],
                organization_type="Private Limited",
                country="India",
                city=vinfo["city"],
                state_province=vinfo["state"],
                primary_phone=vinfo["phone"],
                primary_email=vinfo["email"],
                pan_number=vinfo["pan"],
                gstin=vinfo["gstin"],
                status="APPROVED",
                verification_status="VERIFIED"
            )
            db.add(org)
            await db.flush()
        else:
            org.status = "APPROVED"
            org.verification_status = "VERIFIED"
            org.trade_name = vinfo["trade_name"]
            org.display_name = vinfo["trade_name"]
            org.vendor_code = vinfo["vendor_code"]
            org.primary_phone = vinfo["phone"]

        # Ensure User Accounts for both primary email and alt_email
        for email_to_use in [vinfo["email"], vinfo.get("alt_email")]:
            if not email_to_use:
                continue
            stmt_user = select(User).options(selectinload(User.roles)).where(User.email == email_to_use)
            res_user = await db.execute(stmt_user)
            user = res_user.scalars().first()

            if not user:
                user = User(
                    id=str(uuid.uuid4()),
                    email=email_to_use,
                    password_hash=get_password_hash("password123"),
                    full_name=vinfo["name"],
                    phone=vinfo["phone"],
                    is_active=True,
                    is_verified=True,
                    vendor_organization_id=org.id,
                    roles=[vendor_role]
                )
                db.add(user)
                await db.flush()
            else:
                user.password_hash = get_password_hash("password123")
                user.is_active = True
                user.is_verified = True
                user.vendor_organization_id = org.id
                user.phone = vinfo["phone"]
                if vendor_role not in user.roles:
                    user.roles.append(vendor_role)

        seeded_list.append({
            "email": vinfo["email"],
            "company": vinfo["org_name"],
            "trade_name": vinfo["trade_name"],
            "password": "password123",
            "status": "APPROVED"
        })

    # 3. Ensure Admin Account
    for admin_email in ["admin@test.com", "admin@srm.com"]:
        stmt_admin = select(User).options(selectinload(User.roles)).where(User.email == admin_email)
        res_adm = await db.execute(stmt_admin)
        adm = res_adm.scalars().first()
        if not adm:
            adm = User(
                id=str(uuid.uuid4()),
                email=admin_email,
                password_hash=get_password_hash("password123"),
                full_name="Procurement Administrator",
                is_active=True,
                is_verified=True,
                vendor_organization_id=None,
                roles=[admin_role]
            )
            db.add(adm)
        else:
            adm.password_hash = get_password_hash("password123")
            adm.is_active = True
            adm.is_verified = True
            if admin_role not in adm.roles:
                adm.roles.append(admin_role)

    await db.commit()

    return {
        "status": "success",
        "message": "Successfully seeded 5 approved demo vendor accounts and admin user.",
        "vendors": seeded_list,
        "default_password": "password123"
    }

