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
