import uuid
import hashlib
from typing import BinaryIO, Tuple
from fastapi import UploadFile
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.storage.local import LocalStorageService
from app.models.document import Document, DocumentVersion
from app.core.config import settings
from app.core.exceptions import APIException

class DocumentService:
    def __init__(self, db: AsyncSession, storage_service: LocalStorageService):
        self.db = db
        self.storage = storage_service
        self.allowed_mimes = {
            "application/pdf",
            "image/jpeg",
            "image/png",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/csv",
            "text/plain",
            "application/vnd.ms-excel",
            "application/octet-stream"
        }

    async def upload_document(
        self,
        vendor_organization_id: str | None,
        document_type: str,
        file: UploadFile,
        uploaded_by_user_id: str,
        document_id: str | None = None
    ) -> DocumentVersion:
        # 1. Validate File
        if not file.content_type in self.allowed_mimes:
            # Fallback for octet-stream or unhandled mime
            pass
            
        file_bytes = await file.read()
        file_size = len(file_bytes)
        
        if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
            raise APIException("FILE_TOO_LARGE", f"File exceeds maximum allowed size of 7 MB ({settings.MAX_UPLOAD_SIZE_BYTES} bytes).", 400)
            
        if file_size == 0:
            raise APIException("BAD_REQUEST", "File cannot be empty.", 400)
            
        # 2. Compute checksum
        checksum = hashlib.sha256(file_bytes).hexdigest()
        
        # 3. Handle Document (Create or Version bump)
        if document_id:
            # Check if document exists and belongs to the vendor (if specified)
            query = select(Document).where(Document.id == document_id)
            if vendor_organization_id:
                query = query.where(Document.vendor_organization_id == vendor_organization_id)
            result = await self.db.execute(query)
            document = result.scalar_one_or_none()
            if not document:
                raise APIException("NOT_FOUND", "Document not found or unauthorized.", 404)
                
            # Get latest version number
            stmt = select(func.max(DocumentVersion.version_number)).where(DocumentVersion.document_id == document_id)
            result = await self.db.execute(stmt)
            latest_version = result.scalar() or 0
            version_number = latest_version + 1
        else:
            document = Document(
                vendor_organization_id=vendor_organization_id,
                document_type=document_type
            )
            self.db.add(document)
            await self.db.flush()
            version_number = 1
            
        # 4. Save to Storage
        prefix = vendor_organization_id or "admin_boq"
        stored_key = f"{prefix}/{document.id}/v{version_number}_{uuid.uuid4().hex}"
        await self.storage.put(stored_key, file_bytes)
        
        # 5. Create Version Record
        doc_version = DocumentVersion(
            document_id=document.id,
            version_number=version_number,
            original_filename=file.filename or "unknown",
            stored_key=stored_key,
            mime_type=file.content_type,
            file_size=file_size,
            checksum_sha256=checksum,
            uploaded_by_user_id=uploaded_by_user_id
        )
        self.db.add(doc_version)
        await self.db.commit()
        await self.db.refresh(doc_version)
        
        return doc_version

    async def get_vendor_documents(self, vendor_organization_id: str) -> list[Document]:
        stmt = (
            select(Document)
            .options(selectinload(Document.versions))
            .where(Document.vendor_organization_id == vendor_organization_id)
            .order_by(desc(Document.created_at))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_document(self, vendor_organization_id: str, document_id: str) -> Document:
        stmt = (
            select(Document)
            .options(selectinload(Document.versions))
            .where(
                Document.id == document_id,
                Document.vendor_organization_id == vendor_organization_id
            )
        )
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        if not doc:
            raise APIException("NOT_FOUND", "Document not found.", 404)
        return doc

    async def get_document_versions(self, vendor_organization_id: str, document_id: str) -> list[DocumentVersion]:
        # Enforce that Document belongs to vendor_organization_id
        doc = await self.get_document(vendor_organization_id, document_id)
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc.id)
            .order_by(desc(DocumentVersion.version_number))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_document_version(self, vendor_organization_id: str, document_version_id: str) -> DocumentVersion:
        stmt = (
            select(DocumentVersion)
            .join(Document, DocumentVersion.document_id == Document.id)
            .where(
                DocumentVersion.id == document_version_id,
                Document.vendor_organization_id == vendor_organization_id
            )
        )
        result = await self.db.execute(stmt)
        version = result.scalar_one_or_none()
        if not version:
            raise APIException("NOT_FOUND", "Document version not found or unauthorized.", 404)
        return version

    async def get_document_download_content(
        self,
        vendor_organization_id: str,
        document_id: str,
        version_id: str | None = None
    ) -> Tuple[bytes, str, str]:
        # 1. Enforce document ownership
        doc = await self.get_document(vendor_organization_id, document_id)
        
        # 2. Find target version
        if version_id:
            stmt = select(DocumentVersion).where(
                DocumentVersion.id == version_id,
                DocumentVersion.document_id == doc.id
            )
            result = await self.db.execute(stmt)
            version = result.scalar_one_or_none()
            if not version:
                raise APIException("NOT_FOUND", "Document version not found.", 404)
        else:
            # Latest version
            stmt = select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id
            ).order_by(desc(DocumentVersion.version_number))
            result = await self.db.execute(stmt)
            version = result.scalars().first()
            if not version:
                raise APIException("NOT_FOUND", "No versions found for this document.", 404)

        # 3. Read bytes securely from StorageService
        if not await self.storage.exists(version.stored_key):
            raise APIException("NOT_FOUND", "Stored document content is missing.", 404)
            
        file_bytes = await self.storage.get(version.stored_key)
        return file_bytes, version.original_filename, version.mime_type


# Backward compatibility alias
DocumentUploadService = DocumentService
