import uuid
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, Boolean, JSON, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.db.base import Base

class QuestionnaireTemplate(Base):
    __tablename__ = "questionnaire_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    context_type: Mapped[str] = mapped_column(Enum("ONBOARDING", "TENDER_ELIGIBILITY", name="questionnaire_context_type_enum"), nullable=False)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    versions: Mapped[list["QuestionnaireTemplateVersion"]] = relationship("QuestionnaireTemplateVersion", back_populates="template", cascade="all, delete-orphan")


class QuestionnaireTemplateVersion(Base):
    __tablename__ = "questionnaire_template_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("questionnaire_templates.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    
    status: Mapped[str] = mapped_column(Enum("DRAFT", "PUBLISHED", "ARCHIVED", name="template_version_status_enum"), default="DRAFT")
    published_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    template: Mapped["QuestionnaireTemplate"] = relationship("QuestionnaireTemplate", back_populates="versions")
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="template_version", cascade="all, delete-orphan", order_by="Question.display_order")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("questionnaire_template_versions.id", ondelete="CASCADE"), nullable=False)
    
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(
        Enum("TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "BOOLEAN", "FILE_UPLOAD", "SINGLE_SELECT", "MULTI_SELECT", name="question_type_enum"), 
        nullable=False
    )
    
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    
    validation_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    units: Mapped[str | None] = mapped_column(String(32), nullable=True)
    
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    template_version: Mapped["QuestionnaireTemplateVersion"] = relationship("QuestionnaireTemplateVersion", back_populates="questions")


class QuestionnaireResponse(Base):
    __tablename__ = "questionnaire_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_organizations.id", ondelete="CASCADE"), nullable=False)
    template_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("questionnaire_template_versions.id", ondelete="RESTRICT"), nullable=False)
    
    status: Mapped[str] = mapped_column(Enum("DRAFT", "SUBMITTED", "EVALUATED", name="response_status_enum"), default="DRAFT")
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    question_responses: Mapped[list["QuestionResponse"]] = relationship("QuestionResponse", back_populates="questionnaire_response", cascade="all, delete-orphan")


class QuestionResponse(Base):
    __tablename__ = "question_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    response_id: Mapped[str] = mapped_column(String(36), ForeignKey("questionnaire_responses.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False)
    
    response_value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_value_numeric: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    response_value_boolean: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    
    evaluator_verified: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    questionnaire_response: Mapped["QuestionnaireResponse"] = relationship("QuestionnaireResponse", back_populates="question_responses")
    evidence_documents: Mapped[list["QuestionResponseDocument"]] = relationship("QuestionResponseDocument", back_populates="question_response", cascade="all, delete-orphan")


class QuestionResponseDocument(Base):
    """Associates one or multiple DocumentVersions with a QuestionResponse"""
    __tablename__ = "question_response_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_response_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_responses.id", ondelete="CASCADE"), nullable=False)
    document_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_versions.id", ondelete="RESTRICT"), nullable=False)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    question_response: Mapped["QuestionResponse"] = relationship("QuestionResponse", back_populates="evidence_documents")
