# Phase 6 Deployment Readiness Checklist

## Application
- [x] Backend starts (FastAPI via Uvicorn runs successfully).
- [x] Frontend starts (Next.js production build and PM2 spawn successful).
- [x] Extraction worker starts (Python module `app.worker.job_runner` loads).
- [x] Embedding worker starts (Python module `app.worker.embedding_runner` loads).

## Database
- [x] MySQL reachable.
- [x] Alembic clean (No schema drift detected via `alembic check`).
- [x] Backups documented (Strategy detailed in `PRODUCTION_RUNBOOK.md`).

## Qdrant
- [x] Qdrant reachable.
- [x] Timeout configured (explicit connection timeouts implemented in `qdrant.py`).
- [x] Tenant filters verified (Qdrant semantic searches filter by vendor ID).

## Security
- [x] Production config validation (`ENVIRONMENT=production` strictly enforces API keys and CORS).
- [x] Tenant isolation (Confirmed via `test_vendor_isolation.py` and Phase 5 integration tests).
- [x] RBAC (Admin routes are protected).
- [x] Error sanitization (500 errors strip internal stack traces and return UUIDs).
- [x] Security headers (HSTS, nosniff, frame-options applied).
- [x] No secrets in frontend (No `.env` leakage in Next.js build).
- [x] No public MySQL (Nginx config proxies only ports 3000/8000).
- [x] No public Qdrant (Excluded from proxy).

## AI
- [x] `google-genai` only (Older SDK has been entirely purged).
- [x] Prompt injection defenses (AI output bound strictly to Pydantic constraints).
- [x] Structured output validation (JSON mode).
- [x] APPROVED-only embeddings (Embedding worker ignores `NEEDS_REVIEW`).
- [x] Deterministic hard constraints (Phase 3E advisory-only engine verified).

## Workers
- [x] Graceful shutdown (SIGTERM captured via `WorkerShutdown` handler).
- [x] Retry logic (Gemini API transient failures trigger backoff).
- [x] Stale job recovery (Orphaned jobs in `PROCESSING` are reclaimed after 15 minutes).
- [x] Duplicate claim prevention (MySQL `FOR UPDATE SKIP LOCKED`).

## Deployment
- [x] PM2 config (`ecosystem.config.js` established for 4 processes).
- [x] Nginx config (`docs/nginx.conf.example` established).
- [x] Environment documentation (`docs/PRODUCTION_ENV.example` formalized).
- [x] Runbook (`docs/PRODUCTION_RUNBOOK.md` formalized).
- [x] Backup procedure (MySQL mysqldump workflow documented).
- [x] Incident checklist (`docs/OPERATIONS_CHECKLIST.md` implemented).
