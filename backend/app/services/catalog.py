import uuid
from typing import List, Optional
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import CatalogRecord
from app.models.document import Document, DocumentVersion
from app.core.exceptions import APIException

class CatalogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload_catalog(
        self,
        vendor_organization_id: str,
        title: str,
        document_version_id: str,
        description: Optional[str] = None,
        catalog_year: Optional[str] = None
    ) -> CatalogRecord:
        # STRICT TENANT ISOLATION: Verify document_version_id belongs to vendor_organization_id
        stmt = (
            select(DocumentVersion)
            .join(Document, DocumentVersion.document_id == Document.id)
            .where(
                DocumentVersion.id == document_version_id,
                Document.vendor_organization_id == vendor_organization_id
            )
        )
        result = await self.db.execute(stmt)
        doc_ver = result.scalar_one_or_none()
        if not doc_ver:
            raise APIException("FORBIDDEN", "Document version not found or unauthorized.", 403)

        catalog = CatalogRecord(
            vendor_organization_id=vendor_organization_id,
            title=title,
            description=description,
            catalog_year=catalog_year,
            document_version_id=doc_ver.id,
            status="ACTIVE"
        )
        self.db.add(catalog)
        await self.db.commit()
        await self.db.refresh(catalog)
        return catalog

    async def get_catalogs(self, vendor_organization_id: str) -> List[CatalogRecord]:
        stmt = (
            select(CatalogRecord)
            .where(
                CatalogRecord.vendor_organization_id == vendor_organization_id,
                CatalogRecord.status == "ACTIVE"
            )
            .order_by(desc(CatalogRecord.created_at))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_catalog(self, vendor_organization_id: str, catalog_id: str) -> CatalogRecord:
        stmt = select(CatalogRecord).where(
            CatalogRecord.id == catalog_id,
            CatalogRecord.vendor_organization_id == vendor_organization_id
        )
        result = await self.db.execute(stmt)
        catalog = result.scalar_one_or_none()
        if not catalog:
            raise APIException("NOT_FOUND", "Catalog not found.", 404)
        return catalog

    async def get_catalog_versions(self, vendor_organization_id: str, catalog_id: str) -> List[DocumentVersion]:
        catalog = await self.get_catalog(vendor_organization_id, catalog_id)
        
        # Load the document associated with the current version
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.id == catalog.document_version_id)
        )
        result = await self.db.execute(stmt)
        current_ver = result.scalar_one_or_none()
        if not current_ver:
            return []

        # Return all versions of that document
        stmt_all = (
            select(DocumentVersion)
            .where(DocumentVersion.document_id == current_ver.document_id)
            .order_by(desc(DocumentVersion.version_number))
        )
        res_all = await self.db.execute(stmt_all)
        return list(res_all.scalars().all())

    async def update_catalog_version(
        self,
        vendor_organization_id: str,
        catalog_id: str,
        document_version_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        catalog_year: Optional[str] = None
    ) -> CatalogRecord:
        catalog = await self.get_catalog(vendor_organization_id, catalog_id)

        # Verify new document version belongs to vendor
        stmt = (
            select(DocumentVersion)
            .join(Document, DocumentVersion.document_id == Document.id)
            .where(
                DocumentVersion.id == document_version_id,
                Document.vendor_organization_id == vendor_organization_id
            )
        )
        result = await self.db.execute(stmt)
        doc_ver = result.scalar_one_or_none()
        if not doc_ver:
            raise APIException("FORBIDDEN", "Document version not found or unauthorized.", 403)

        catalog.document_version_id = doc_ver.id
        if title is not None:
            catalog.title = title
        if description is not None:
            catalog.description = description
        if catalog_year is not None:
            catalog.catalog_year = catalog_year

        await self.db.commit()
        await self.db.refresh(catalog)
        return catalog
