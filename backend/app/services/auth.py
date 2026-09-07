from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone, timedelta
import uuid

from app.models.user import User
from app.models.auth import RefreshToken, AuditEvent
from app.models.auth_otp import OTPCode
from app.models.vendor import VendorOrganization
from app.models.user import User, Role, UserRole
from app.core.exceptions import APIException
from app.core.config import settings
from app.core.security import verify_password, generate_refresh_token, hash_refresh_token, dummy_verify, get_password_hash
from app.services.email import send_otp_email
import random
import string

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_audit_event(self, actor_id: str | None, event_type: str, ip_address: str | None = None, user_agent: str | None = None, metadata: dict | None = None):
        """Logs an audit event to the database."""
        event = AuditEvent(
            actor_user_id=actor_id,
            event_type=event_type,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata_payload=metadata or {}
        )
        self.db.add(event)
        await self.db.flush()

    async def _handle_failed_login(self, user: User, ip_address: str | None = None, user_agent: str | None = None):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
            await self.db.flush()
            await self.log_audit_event(user.id, "ACCOUNT_LOCKED", ip_address, user_agent)
        
        await self.db.commit()
        raise APIException("INVALID_CREDENTIALS", "Invalid email or password.", 401)

    async def authenticate_user(self, email: str, password: str, ip_address: str | None = None, user_agent: str | None = None) -> User:
        """Authenticate a user by email and password, handling lockouts and brute-force protection."""
        stmt = select(User).where(User.email == email.lower())
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            dummy_verify()
            await self.log_audit_event(None, "LOGIN_FAILURE", ip_address, user_agent, {"email": email})
            raise APIException("INVALID_CREDENTIALS", "Invalid email or password.", 401)

            
        if not user.is_active:
            await self.log_audit_event(user.id, "LOGIN_FAILURE", ip_address, user_agent, {"reason": "inactive"})
            raise APIException("INVALID_CREDENTIALS", "Invalid email or password.", 401)

        # Check lockout
        if user.locked_until:
            locked_until = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
            if locked_until > datetime.now(timezone.utc):
                raise APIException("ACCOUNT_LOCKED", "Account is temporarily locked. Try again later.", 403)
            
        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1
            is_locked = False
            if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
                is_locked = True
            
            await self.db.flush()
            await self.log_audit_event(user.id, "LOGIN_FAILURE", ip_address, user_agent)
            if is_locked:
                await self.log_audit_event(user.id, "ACCOUNT_LOCKED", ip_address, user_agent)
                
            await self.db.commit()
            raise APIException("INVALID_CREDENTIALS", "Invalid email or password.", 401)
            
        # Success reset
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)
        
        await self.db.flush()  # Flush update to acquire X lock before S lock
        await self.log_audit_event(user.id, "LOGIN_SUCCESS", ip_address, user_agent)
        await self.db.commit()
        return user

    async def create_refresh_token(self, user_id: str, ip_address: str | None = None, user_agent: str | None = None) -> str:
        """Creates a new refresh token and a new token family."""
        raw_token = generate_refresh_token()
        token_family_id = str(uuid.uuid4())
        
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        
        db_token = RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw_token),
            token_family_id=token_family_id,
            expires_at=expires_at,
            created_from_ip=ip_address,
            user_agent=user_agent
        )
        self.db.add(db_token)
        await self.db.commit()
        return raw_token

    async def rotate_refresh_token(self, old_raw_token: str, ip_address: str | None = None, user_agent: str | None = None) -> tuple[str, User]:
        """Rotates a refresh token. Detects replay attacks and revokes the family if reused."""
        hashed = hash_refresh_token(old_raw_token)
        
        stmt = select(RefreshToken).where(RefreshToken.token_hash == hashed).with_for_update()
        result = await self.db.execute(stmt)
        old_token = result.scalar_one_or_none()
        
        if not old_token:
            raise APIException("INVALID_TOKEN", "Invalid session.", 401)
            
        # Replay Detection
        if old_token.revoked_at is not None:
            # Token was already revoked but used again! Replay attack.
            await self.log_audit_event(old_token.user_id, "TOKEN_REUSE_DETECTED", ip_address, user_agent, {"family": old_token.token_family_id})
            # Revoke entire family
            await self.db.execute(
                update(RefreshToken)
                .where(RefreshToken.token_family_id == old_token.token_family_id)
                .values(revoked_at=datetime.now(timezone.utc))
            )
            await self.db.commit()
            raise APIException("INVALID_TOKEN", "Session invalidated due to suspicious activity.", 401)
            
        if old_token.expires_at:
            expires_at = old_token.expires_at.replace(tzinfo=timezone.utc) if old_token.expires_at.tzinfo is None else old_token.expires_at
            if expires_at < datetime.now(timezone.utc):
                raise APIException("EXPIRED_TOKEN", "Session expired.", 401)
            
        # Lookup User
        user_stmt = select(User).where(User.id == old_token.user_id)
        user_res = await self.db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        
        if not user or not user.is_active:
            raise APIException("INVALID_TOKEN", "Invalid session.", 401)

        # Rotate token
        new_raw_token = generate_refresh_token()
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        
        new_token = RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(new_raw_token),
            token_family_id=old_token.token_family_id,
            expires_at=expires_at,
            created_from_ip=ip_address,
            user_agent=user_agent
        )
        self.db.add(new_token)
        await self.db.flush()
        
        old_token.revoked_at = datetime.now(timezone.utc)
        old_token.replaced_by_token_id = new_token.id
        
        await self.log_audit_event(user.id, "TOKEN_REFRESH", ip_address, user_agent)
        await self.db.commit()
        
        return new_raw_token, user

    async def logout(self, raw_token: str, ip_address: str | None = None, user_agent: str | None = None) -> None:
        """Revokes a specific token family to log out completely."""
        hashed = hash_refresh_token(raw_token)
        stmt = select(RefreshToken).where(RefreshToken.token_hash == hashed)
        result = await self.db.execute(stmt)
        token = result.scalar_one_or_none()
        
        if token:
            await self.db.execute(
                update(RefreshToken)
                .where(RefreshToken.token_family_id == token.token_family_id)
                .values(revoked_at=datetime.now(timezone.utc))
            )
            await self.log_audit_event(token.user_id, "LOGOUT", ip_address, user_agent)
            await self.db.commit()

    async def request_otp(self, email: str, ip_address: str | None = None, user_agent: str | None = None) -> None:
        email = email.lower().strip()
        code = ''.join(random.choices(string.digits, k=6))
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        # Invalidate old OTPs for this email
        await self.db.execute(
            update(OTPCode).where(OTPCode.email == email).values(expires_at=datetime.now(timezone.utc))
        )
        
        otp = OTPCode(email=email, code=code, expires_at=expires_at)
        self.db.add(otp)
        await self.log_audit_event(None, "OTP_REQUESTED", ip_address, user_agent, {"email": email})
        await self.db.commit()
        
        # Call synchronous SMTP sending in thread pool to not block async loop
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, send_otp_email, email, code)

    async def verify_otp(self, email: str, code: str, ip_address: str | None = None, user_agent: str | None = None) -> User:
        email = email.lower().strip()
        
        # Find active OTP
        stmt = select(OTPCode).where(OTPCode.email == email, OTPCode.expires_at > datetime.now(timezone.utc)).order_by(OTPCode.created_at.desc())
        result = await self.db.execute(stmt)
        otp = result.scalars().first()
        
        if not otp:
            raise APIException("INVALID_OTP", "Invalid or expired OTP.", 401)
            
        if otp.attempts >= 3:
            otp.expires_at = datetime.now(timezone.utc)
            await self.db.commit()
            raise APIException("OTP_LOCKED", "Too many attempts. Request a new OTP.", 401)
            
        if otp.code != code:
            otp.attempts += 1
            await self.db.commit()
            raise APIException("INVALID_OTP", "Incorrect OTP.", 401)
            
        # OTP is valid, mark it as expired
        otp.expires_at = datetime.now(timezone.utc)
        
        # Check if user exists
        user_stmt = select(User).where(User.email == email)
        user_res = await self.db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        
        if not user:
            # Check for Vendor role
            role_stmt = select(Role).where(Role.name == "vendor")
            role_res = await self.db.execute(role_stmt)
            vendor_role = role_res.scalar_one_or_none()
            
            # Create dummy vendor organization
            vendor_org = VendorOrganization(
                legal_name=f"Vendor Registration - {email}",
                status="DRAFT",
                verification_status="UNVERIFIED"
            )
            self.db.add(vendor_org)
            await self.db.flush()
            
            user = User(
                email=email,
                password_hash=get_password_hash(str(uuid.uuid4())), # random password, since they login via OTP
                full_name=email.split('@')[0],
                is_active=True,
                is_verified=True,
                vendor_organization_id=vendor_org.id
            )
            self.db.add(user)
            await self.db.flush()
            
            if vendor_role:
                self.db.add(UserRole(user_id=user.id, role_id=vendor_role.id))
                
        user.is_verified = True
        if user.vendor_organization_id:
            org_stmt = select(VendorOrganization).where(VendorOrganization.id == user.vendor_organization_id)
            org_res = await self.db.execute(org_stmt)
            vendor_org = org_res.scalar_one_or_none()
            if vendor_org and vendor_org.verification_status == "UNVERIFIED":
                vendor_org.verification_status = "VERIFIED"

        user.last_login_at = datetime.now(timezone.utc)
        await self.log_audit_event(user.id, "LOGIN_OTP_SUCCESS", ip_address, user_agent)
        await self.db.commit()
        return user
