from fastapi import APIRouter
from app.api.v1 import health, auth, vendor, admin_vendors, vendor_recommendations, admin_recommendations, vendor_registration, admin_boq, admin_search, vendor_boq

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(vendor_registration.router, prefix="/vendor-registration", tags=["vendor_registration"])
api_router.include_router(vendor.router, prefix="/vendor", tags=["vendor"])
api_router.include_router(vendor_boq.router, prefix="/vendor/tenders", tags=["vendor_tenders"])
api_router.include_router(admin_vendors.router, prefix="/admin/vendors", tags=["admin_vendors"])
api_router.include_router(vendor_recommendations.router, prefix="/vendor/recommendations", tags=["vendor_recommendations"])
api_router.include_router(admin_recommendations.router, prefix="/admin/recommendations", tags=["admin_recommendations"])
api_router.include_router(admin_boq.router, prefix="/admin/boq", tags=["admin_boq"])
api_router.include_router(admin_search.router, prefix="/admin/search", tags=["admin_search"])

