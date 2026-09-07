from fastapi import Depends, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.user import User, Role, Permission
from app.core.exceptions import APIException
from app.core.security import decode_access_token

security = HTTPBearer()

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: HTTPAuthorizationCredentials = Security(security)
) -> User:
    """Dependency to retrieve the currently authenticated user from the JWT."""
    payload = decode_access_token(token.credentials)
    if not payload:
        raise APIException("UNAUTHORIZED", "Invalid or expired token.", 401)
        
    user_id = payload.get("sub")
    if not user_id:
        raise APIException("UNAUTHORIZED", "Invalid token.", 401)
        
    # Load user with roles and permissions eagerly for RBAC checks
    stmt = (
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .where(User.id == user_id)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise APIException("UNAUTHORIZED", "User not found.", 401)
    if not user.is_active:
        raise APIException("FORBIDDEN", "Account is inactive.", 403)
        
    return user


def require_permission(required_permission: str):
    """Dependency to enforce that the current user has a specific permission."""
    def permission_checker(current_user: User = Depends(get_current_user)) -> User:
        for role in current_user.roles:
            for perm in role.permissions:
                if perm.name == required_permission:
                    return current_user
                    
        raise APIException("FORBIDDEN", f"Missing required permission: {required_permission}", 403)
    return permission_checker


from app.models.vendor import VendorOrganization

async def get_current_vendor_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> VendorOrganization:
    """
    Dependency to retrieve the authorized vendor context exclusively from the server-side JWT relationship.
    """
    if not current_user.vendor_organization_id:
        raise APIException("FORBIDDEN", "User does not belong to a vendor organization.", 403)
        
    stmt = select(VendorOrganization).where(VendorOrganization.id == current_user.vendor_organization_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    
    if not org:
        raise APIException("FORBIDDEN", "Vendor organization not found or inactive.", 403)
        
    return org


def require_admin_or_vendor_owner():
    """
    Dependency allowing an admin (with 'vendors.approve' permission) OR the owner of the vendor organization to access a resource.
    The endpoint using this MUST accept a vendor_id in the path, e.g., `/vendors/{vendor_id}`.
    """
    async def checker(
        request: Request,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> VendorOrganization:
        target_vendor_id = request.path_params.get("vendor_id")
        if not target_vendor_id:
            raise APIException("BAD_REQUEST", "vendor_id path parameter is required.", 400)
            
        # Check if admin
        is_admin = False
        for role in current_user.roles:
            for perm in role.permissions:
                if perm.name in ("vendors.approve", "vendors.read_all"):
                    is_admin = True
                    break
        
        # Check if owner
        is_owner = current_user.vendor_organization_id == target_vendor_id
        
        if not is_admin and not is_owner:
            raise APIException("FORBIDDEN", "Access denied.", 403)
            
        stmt = select(VendorOrganization).where(VendorOrganization.id == target_vendor_id)
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()
        
        if not org:
            raise APIException("NOT_FOUND", "Vendor organization not found.", 404)
            
        return org
        
    return checker

from app.services.ai.embedding import GeminiEmbeddingProvider, EmbeddingProvider

def get_embedding_provider() -> EmbeddingProvider:
    return GeminiEmbeddingProvider()
