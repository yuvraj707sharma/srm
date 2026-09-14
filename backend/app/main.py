from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.core.exceptions import APIException, api_exception_handler, global_exception_handler
from app.core.logging import setup_logging
import uuid

setup_logging()

from contextlib import asynccontextmanager
import logging

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-ensure new tables and columns exist so server never crashes on missing schema
    try:
        from app.db.base import Base
        from app.db.session import engine
        import app.models.vendor
        import app.models.user
        import app.models.catalog
        import app.models.boq
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS vendor_evaluations (
                        id VARCHAR(36) PRIMARY KEY,
                        vendor_organization_id VARCHAR(36) NOT NULL,
                        hospitals_score FLOAT DEFAULT 0.0,
                        hospitals_meets BOOLEAN DEFAULT TRUE,
                        hospitals_remarks TEXT NULL,
                        turnover_score FLOAT DEFAULT 0.0,
                        turnover_meets BOOLEAN DEFAULT TRUE,
                        turnover_remarks TEXT NULL,
                        high_value_projects_score FLOAT DEFAULT 0.0,
                        high_value_projects_meets BOOLEAN DEFAULT TRUE,
                        high_value_projects_remarks TEXT NULL,
                        service_base_score FLOAT DEFAULT 0.0,
                        service_base_meets BOOLEAN DEFAULT TRUE,
                        service_base_remarks TEXT NULL,
                        balance_sheet_score FLOAT DEFAULT 0.0,
                        balance_sheet_verified BOOLEAN DEFAULT TRUE,
                        balance_sheet_remarks TEXT NULL,
                        total_score FLOAT DEFAULT 0.0,
                        evaluation_grade VARCHAR(32) DEFAULT 'B_GRADE',
                        recommendation VARCHAR(64) DEFAULT 'QUALIFIED',
                        evaluator_name VARCHAR(128) NULL,
                        admin_summary_notes TEXT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (vendor_organization_id) REFERENCES vendor_organizations(id) ON DELETE CASCADE
                    )
                """))
            except Exception as e_tbl:
                logging.getLogger("uvicorn.error").warning(f"Create vendor_evaluations check: {e_tbl}")
            try:
                await conn.execute(text("ALTER TABLE vendor_organizations ADD COLUMN high_value_projects_threshold_cr DECIMAL(10, 2) DEFAULT 1.00"))
            except Exception:
                pass
        logging.getLogger("uvicorn.error").info("Startup DB schema verification completed successfully.")
    except Exception as e:
        logging.getLogger("uvicorn.error").warning(f"Startup DB auto-migration check: {e}")
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Middleware
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Exception handlers
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Routers
app.include_router(api_router, prefix=settings.API_V1_STR)
