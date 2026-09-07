import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.questionnaire import (
    QuestionnaireTemplate,
    QuestionnaireTemplateVersion,
    Question,
    QuestionnaireResponse,
    QuestionResponse,
    QuestionResponseDocument
)
from app.models.document import Document, DocumentVersion
from app.core.exceptions import APIException

class QuestionnaireService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_available_templates(self, context_type: str = "ONBOARDING") -> List[QuestionnaireTemplate]:
        stmt = (
            select(QuestionnaireTemplate)
            .options(
                selectinload(QuestionnaireTemplate.versions).selectinload(QuestionnaireTemplateVersion.questions)
            )
            .where(QuestionnaireTemplate.context_type == context_type)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_published_template_version(self, template_version_id: str) -> QuestionnaireTemplateVersion:
        stmt = (
            select(QuestionnaireTemplateVersion)
            .options(
                selectinload(QuestionnaireTemplateVersion.template),
                selectinload(QuestionnaireTemplateVersion.questions)
            )
            .where(
                QuestionnaireTemplateVersion.id == template_version_id,
                QuestionnaireTemplateVersion.status == "PUBLISHED"
            )
        )
        result = await self.db.execute(stmt)
        version = result.scalar_one_or_none()
        if not version:
            raise APIException("NOT_FOUND", "Published questionnaire template version not found.", 404)
        return version

    async def start_questionnaire(
        self, 
        vendor_organization_id: str, 
        template_version_id: str
    ) -> QuestionnaireResponse:
        # 1. Verify template version is published
        version = await self.get_published_template_version(template_version_id)
        
        # 2. Check if active draft already exists for this vendor and template version
        stmt = select(QuestionnaireResponse).where(
            QuestionnaireResponse.vendor_organization_id == vendor_organization_id,
            QuestionnaireResponse.template_version_id == template_version_id,
            QuestionnaireResponse.status == "DRAFT"
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # 3. Create new QuestionnaireResponse permanently locked to this template_version_id
        response = QuestionnaireResponse(
            vendor_organization_id=vendor_organization_id,
            template_version_id=version.id,
            status="DRAFT"
        )
        self.db.add(response)
        await self.db.commit()
        await self.db.refresh(response)
        return response

    async def get_vendor_questionnaires(self, vendor_organization_id: str) -> List[QuestionnaireResponse]:
        stmt = (
            select(QuestionnaireResponse)
            .where(QuestionnaireResponse.vendor_organization_id == vendor_organization_id)
            .order_by(desc(QuestionnaireResponse.created_at))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_questionnaire_response(
        self, 
        vendor_organization_id: str, 
        response_id: str
    ) -> QuestionnaireResponse:
        stmt = (
            select(QuestionnaireResponse)
            .options(
                selectinload(QuestionnaireResponse.question_responses)
                .selectinload(QuestionResponse.evidence_documents)
            )
            .where(
                QuestionnaireResponse.id == response_id,
                QuestionnaireResponse.vendor_organization_id == vendor_organization_id
            )
        )
        result = await self.db.execute(stmt)
        response = result.scalar_one_or_none()
        if not response:
            raise APIException("NOT_FOUND", "Questionnaire response not found.", 404)
        return response

    async def save_questionnaire_answers(
        self,
        vendor_organization_id: str,
        response_id: str,
        answers: List[Dict[str, Any]],
        evidence_map: Optional[Dict[str, List[str]]] = None
    ) -> QuestionnaireResponse:
        """
        answers: list of dicts: [{"question_id": str, "value": Any}]
        evidence_map: dict of {question_id: [document_version_id, ...]}
        """
        # 1. Enforce response ownership and status
        response = await self.get_questionnaire_response(vendor_organization_id, response_id)
        if response.status != "DRAFT":
            raise APIException("BAD_REQUEST", f"Cannot modify questionnaire response in '{response.status}' status.", 400)

        # 2. Load questions from the locked template version
        stmt = select(Question).where(Question.template_version_id == response.template_version_id)
        result = await self.db.execute(stmt)
        valid_questions = {q.id: q for q in result.scalars().all()}

        # 3. Existing question responses for upsert
        existing_responses = {qr.question_id: qr for qr in response.question_responses}

        for item in answers:
            q_id = item.get("question_id")
            val = item.get("value")
            
            if q_id not in valid_questions:
                raise APIException("BAD_REQUEST", f"Invalid question ID {q_id} for this questionnaire template.", 400)
            
            question = valid_questions[q_id]
            qr = existing_responses.get(q_id)
            if not qr:
                qr = QuestionResponse(
                    response_id=response.id,
                    question_id=q_id
                )
                self.db.add(qr)
                await self.db.flush()
                existing_responses[q_id] = qr

            # Map typed response
            if question.question_type in ("NUMBER", "CURRENCY"):
                try:
                    qr.response_value_numeric = float(val) if val is not None else None
                except (ValueError, TypeError):
                    raise APIException("BAD_REQUEST", f"Invalid numeric value for question {q_id}", 400)
            elif question.question_type == "BOOLEAN":
                qr.response_value_boolean = bool(val) if val is not None else None
            else:
                qr.response_value_text = str(val) if val is not None else None

        # 4. Handle evidence documents
        if evidence_map:
            for q_id, doc_ver_ids in evidence_map.items():
                if q_id not in valid_questions:
                    raise APIException("BAD_REQUEST", f"Invalid question ID {q_id} for evidence.", 400)
                
                qr = existing_responses.get(q_id)
                if not qr:
                    qr = QuestionResponse(
                        response_id=response.id,
                        question_id=q_id
                    )
                    self.db.add(qr)
                    await self.db.flush()
                    existing_responses[q_id] = qr

                # Clear existing evidence links for this question
                stmt = select(QuestionResponseDocument).where(QuestionResponseDocument.question_response_id == qr.id)
                res = await self.db.execute(stmt)
                for existing_doc in res.scalars().all():
                    await self.db.delete(existing_doc)

                # Validate and link each document version
                for doc_ver_id in doc_ver_ids:
                    # STRICT TENANT ISOLATION CHECK: DocumentVersion must belong to vendor_organization_id
                    stmt = (
                        select(DocumentVersion)
                        .join(Document, DocumentVersion.document_id == Document.id)
                        .where(
                            DocumentVersion.id == doc_ver_id,
                            Document.vendor_organization_id == vendor_organization_id
                        )
                    )
                    result = await self.db.execute(stmt)
                    doc_ver = result.scalar_one_or_none()
                    if not doc_ver:
                        raise APIException(
                            "FORBIDDEN", 
                            f"Document version {doc_ver_id} not found or unauthorized.", 
                            403
                        )
                    
                    qrd = QuestionResponseDocument(
                        question_response_id=qr.id,
                        document_version_id=doc_ver.id
                    )
                    self.db.add(qrd)

        await self.db.commit()
        await self.db.refresh(response)
        return response

    async def submit_response(
        self,
        vendor_organization_id: str,
        response_id: str,
        answers: Optional[List[Dict[str, Any]]] = None,
        evidence_map: Optional[Dict[str, List[str]]] = None
    ) -> QuestionnaireResponse:
        # Save first if payload provided
        if answers is not None or evidence_map is not None:
            await self.save_questionnaire_answers(
                vendor_organization_id=vendor_organization_id,
                response_id=response_id,
                answers=answers or [],
                evidence_map=evidence_map
            )

        response = await self.get_questionnaire_response(vendor_organization_id, response_id)
        if response.status != "DRAFT":
            raise APIException("BAD_REQUEST", f"Cannot submit questionnaire in '{response.status}' status.", 400)

        # Validate all required questions
        stmt = select(Question).where(Question.template_version_id == response.template_version_id)
        result = await self.db.execute(stmt)
        template_questions = result.scalars().all()

        answered_map = {qr.question_id: qr for qr in response.question_responses}

        for q in template_questions:
            if q.is_required:
                qr = answered_map.get(q.id)
                if not qr:
                    raise APIException("BAD_REQUEST", f"Missing required question: {q.question_text}", 400)
                
                # Check value existence
                has_value = (
                    qr.response_value_text is not None and qr.response_value_text.strip() != ""
                ) or (
                    qr.response_value_numeric is not None
                ) or (
                    qr.response_value_boolean is not None
                )
                if not has_value:
                    raise APIException("BAD_REQUEST", f"Missing required answer for: {q.question_text}", 400)

            if q.evidence_required:
                qr = answered_map.get(q.id)
                if not qr or not qr.evidence_documents or len(qr.evidence_documents) == 0:
                    raise APIException("BAD_REQUEST", f"Evidence document required for: {q.question_text}", 400)

        # Transition to SUBMITTED
        response.status = "SUBMITTED"
        await self.db.commit()
        await self.db.refresh(response)
        return response
