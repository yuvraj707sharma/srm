from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional

from app.models.vendor import VendorOrganization
from app.models.catalog import CatalogRecord
from app.models.extraction import CatalogExtractionJob, AIExtractionRecord
from app.core.exceptions import APIException

class ExtractionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def enqueue_catalog_extraction(self, vendor_organization_id: str, catalog_id: str) -> CatalogExtractionJob:
        """
        Creates an extraction job for a given catalog, strictly using the currently linked DocumentVersion.
        Ensures tenant isolation and prevents duplicate active jobs.
        """
        # 1. Verify ownership and get the active document version
        stmt = select(CatalogRecord).where(
            CatalogRecord.id == catalog_id,
            CatalogRecord.vendor_organization_id == vendor_organization_id
        )
        result = await self.db.execute(stmt)
        catalog = result.scalars().first()
        
        if not catalog:
            raise APIException("NOT_FOUND", "Catalog not found or you do not have access.", 404)
            
        if catalog.status != "ACTIVE":
            raise APIException("BAD_REQUEST", f"Cannot extract from catalog in status: {catalog.status}", 400)
            
        document_version_id = catalog.document_version_id
        if not document_version_id:
            raise APIException("BAD_REQUEST", "Catalog does not have an associated document version.", 400)

        # 2. Check for existing active jobs (PENDING or PROCESSING) for this exact catalog & version
        stmt_existing = select(CatalogExtractionJob).where(
            CatalogExtractionJob.vendor_organization_id == vendor_organization_id,
            CatalogExtractionJob.catalog_id == catalog_id,
            CatalogExtractionJob.document_version_id == document_version_id,
            CatalogExtractionJob.status.in_(["PENDING", "PROCESSING"])
        )
        existing_res = await self.db.execute(stmt_existing)
        existing_job = existing_res.scalars().first()
        
        if existing_job:
            return existing_job

        # 3. Create the new job
        new_job = CatalogExtractionJob(
            catalog_id=catalog_id,
            document_version_id=document_version_id,
            vendor_organization_id=vendor_organization_id,
            status="PENDING",
            retry_count=0
        )
        self.db.add(new_job)
        await self.db.commit()
        await self.db.refresh(new_job)
        
        return new_job

    async def get_extraction_status(self, vendor_organization_id: str, catalog_id: str) -> Optional[CatalogExtractionJob]:
        """
        Returns the most recent extraction job for the given catalog.
        """
        stmt = select(CatalogExtractionJob).where(
            CatalogExtractionJob.vendor_organization_id == vendor_organization_id,
            CatalogExtractionJob.catalog_id == catalog_id
        ).order_by(CatalogExtractionJob.created_at.desc())
        
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_latest_ai_extraction_record(self, vendor_organization_id: str, catalog_id: str, job_id: str) -> Optional[AIExtractionRecord]:
        """
        Deterministically returns the latest AI extraction record for a specific completed job.
        This provides a safe contract for Phase 3C so it does not consume incomplete/failed jobs,
        or accidentally consume older records generated during retries.
        """
        # First ensure the job actually belongs to the vendor and is COMPLETED
        stmt_job = select(CatalogExtractionJob).where(
            CatalogExtractionJob.id == job_id,
            CatalogExtractionJob.vendor_organization_id == vendor_organization_id,
            CatalogExtractionJob.catalog_id == catalog_id,
            CatalogExtractionJob.status == "COMPLETED"
        )
        job_res = await self.db.execute(stmt_job)
        job = job_res.scalars().first()
        
        if not job:
            return None
            
        # Get the most recent extraction record for this job
        stmt_record = select(AIExtractionRecord).where(
            AIExtractionRecord.job_id == job_id,
            AIExtractionRecord.vendor_organization_id == vendor_organization_id
        ).order_by(AIExtractionRecord.created_at.desc())
        
        record_res = await self.db.execute(stmt_record)
        return record_res.scalars().first()


    async def get_drafts_for_catalog(self, vendor_organization_id: str, catalog_id: str, status_filter: Optional[str] = None):
        from app.models.extraction import CatalogProductDraft, AIExtractionRecord, CatalogExtractionJob
        stmt = (
            select(CatalogProductDraft, AIExtractionRecord)
            .join(AIExtractionRecord, AIExtractionRecord.product_draft_id == CatalogProductDraft.id)
            .join(CatalogExtractionJob, CatalogExtractionJob.id == AIExtractionRecord.job_id)
            .where(
                CatalogProductDraft.vendor_organization_id == vendor_organization_id,
                CatalogProductDraft.catalog_id == catalog_id,
                CatalogExtractionJob.status == "COMPLETED"
            )
        )
        if status_filter:
            stmt = stmt.where(CatalogProductDraft.status == status_filter)
        res = await self.db.execute(stmt)
        return res.all()

    async def get_draft_by_id(self, vendor_organization_id: str, draft_id: str):
        from app.models.extraction import CatalogProductDraft, AIExtractionRecord, CatalogExtractionJob
        stmt = (
            select(CatalogProductDraft, AIExtractionRecord)
            .join(AIExtractionRecord, AIExtractionRecord.product_draft_id == CatalogProductDraft.id)
            .join(CatalogExtractionJob, CatalogExtractionJob.id == AIExtractionRecord.job_id)
            .where(
                CatalogProductDraft.vendor_organization_id == vendor_organization_id,
                CatalogProductDraft.id == draft_id
            )
        )
        res = await self.db.execute(stmt)
        return res.first()

    async def get_draft_by_id(self, vendor_organization_id: str, draft_id: str):
        from app.models.extraction import CatalogProductDraft, AIExtractionRecord, CatalogExtractionJob
        stmt = (
            select(CatalogProductDraft, AIExtractionRecord)
            .join(AIExtractionRecord, AIExtractionRecord.product_draft_id == CatalogProductDraft.id)
            .join(CatalogExtractionJob, CatalogExtractionJob.id == AIExtractionRecord.job_id)
            .where(
                CatalogProductDraft.vendor_organization_id == vendor_organization_id,
                CatalogProductDraft.id == draft_id
            )
        )
        res = await self.db.execute(stmt)
        return res.first()

    async def update_draft(self, vendor_organization_id: str, draft_id: str, product_name: str, attributes: str):
        from app.models.extraction import CatalogProductDraft
        from sqlalchemy import update
        import json
        stmt = (
            update(CatalogProductDraft)
            .where(
                CatalogProductDraft.id == draft_id,
                CatalogProductDraft.vendor_organization_id == vendor_organization_id,
                CatalogProductDraft.status == "NEEDS_REVIEW"
            )
            .values(
                product_name=product_name,
                attributes_json=json.dumps(attributes) if isinstance(attributes, dict) else attributes
            )
        )
        res = await self.db.execute(stmt)
        await self.db.commit()
        return res.rowcount

    async def approve_draft(self, vendor_organization_id: str, draft_id: str, user_id: str):
        from app.models.extraction import CatalogProductDraft
        from app.models.embedding import CatalogEmbeddingJob
        from sqlalchemy import update, select
        from datetime import datetime, timezone
        
        # We need the catalog_id to create the embedding job
        stmt_select = select(CatalogProductDraft).where(
            CatalogProductDraft.id == draft_id,
            CatalogProductDraft.vendor_organization_id == vendor_organization_id,
            CatalogProductDraft.status == "NEEDS_REVIEW"
        ).with_for_update()
        res_select = await self.db.execute(stmt_select)
        draft = res_select.scalars().first()
        
        if not draft:
            return 0
            
        catalog_id = draft.catalog_id

        # Update draft
        draft.status = "APPROVED"
        draft.reviewed_by_user_id = user_id
        draft.reviewed_at = datetime.now(timezone.utc)
        
        # Upsert embedding job
        stmt_existing_job = select(CatalogEmbeddingJob).where(
            CatalogEmbeddingJob.draft_id == draft_id
        ).with_for_update()
        res_existing = await self.db.execute(stmt_existing_job)
        existing_job = res_existing.scalars().first()
        
        if existing_job:
            existing_job.status = "PENDING"
            existing_job.retry_count = 0
            existing_job.error_details = None
        else:
            new_job = CatalogEmbeddingJob(
                vendor_organization_id=vendor_organization_id,
                catalog_id=catalog_id,
                draft_id=draft_id,
                status="PENDING",
                retry_count=0
            )
            self.db.add(new_job)

        await self.db.commit()
        return 1

    async def reject_draft(self, vendor_organization_id: str, draft_id: str, user_id: str, rejection_reason: str):
        from app.models.extraction import CatalogProductDraft
        from sqlalchemy import update
        from datetime import datetime, timezone
        stmt = (
            update(CatalogProductDraft)
            .where(
                CatalogProductDraft.id == draft_id,
                CatalogProductDraft.vendor_organization_id == vendor_organization_id,
                CatalogProductDraft.status == "NEEDS_REVIEW"
            )
            .values(
                status="REJECTED",
                reviewed_by_user_id=user_id,
                reviewed_at=datetime.now(timezone.utc),
                rejection_reason=rejection_reason
            )
        )
        res = await self.db.execute(stmt)
        await self.db.commit()
        return res.rowcount
