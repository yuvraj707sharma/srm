# Domain Model & Entity Specification

## JECRC Hospital & Medical College — Supply Chain & Tender Procurement Portal

---

## 1. Domain Architecture Overview

The domain model is architected to handle multi-category institutional procurement securely, maintaining strict boundaries for generic product masters, relational BOQ hierarchies, formalized bid opening events, and granular, traceable AI extraction evidence. 

All primary structural definitions (Category Schemas, Questionnaires, BOQs) employ strict versioning to ensure that historical bids, tenders, and vendor profiles are evaluated exactly against the criteria defined at that specific point in time.

---

## 2. Generic Product Master & Strict Category Schema Versioning

### 2.1 Category Schema Versioning Entities
Defines the configurable attributes, units, and validation rules for specific procurement categories. To guarantee historical integrity, schema definitions are strictly versioned. Once a schema version is used by a published BOQ, tender, quotation, or catalog extraction, that schema version becomes immutable.

- `Category`:
  - `id`: UUID (PK)
  - `category_code`: Unique string (e.g., `RADIOLOGY`, `MGPS`)
  - `category_name`: Human-readable label
- `CategorySchema`:
  - `id`: UUID (PK)
  - `category_id`: FK -> `Category.id`
  - `schema_name`: VARCHAR(255)
- `CategorySchemaVersion`:
  - `id`: UUID (PK)
  - `category_schema_id`: FK -> `CategorySchema.id`
  - `version_number`: Integer
  - `schema_definition`: JSON (Complete JSON Schema describing allowed/required technical attributes)
  - `status`: ENUM (`DRAFT`, `PUBLISHED`, `ARCHIVED`)
  - `published_at`: Datetime
  - `created_at` / `created_by`: Audit trails
- `CategoryAttributeDefinition`:
  - `id`: UUID (PK)
  - `schema_version_id`: FK -> `CategorySchemaVersion.id`
  - `attribute_key`: VARCHAR(128)
  - `data_type`: ENUM (`STRING`, `NUMBER`, `BOOLEAN`, `ENUM`)
  - `validation_rules`: JSON

### 2.2 `Product` (Core Generic Product Master)
Maintains pure, clean generic identifiers. **No permanent fields exist for specific category attributes (e.g., pharmaceutical dosage, radiology kV/mA, or refrigerator temperature).** These belong strictly to the CategorySchema attribute payload.
- `id`: UUID (PK)
- `item_code`: VARCHAR(64) Unique
- `item_name`: VARCHAR(255) Mandatory
- `generic_name`: VARCHAR(255)
- `short_description`: TEXT
- `category_id`: FK -> `Category.id`
- `uoi`: VARCHAR(32) Unit of Issue
- `uom`: VARCHAR(32) Unit of Measurement
- `pack_size`: Decimal(10, 2)
- `hsn_code`: VARCHAR(16)
- `tax_category`: VARCHAR(32)
- `manufacturer_or_brand`: VARCHAR(128)
- `schema_version_id`: FK -> `CategorySchemaVersion.id` (Locks the exact schema version this product references)
- `custom_attributes`: JSON (Validated against `CategorySchemaVersion.schema_definition`)
- `status`: ENUM (`ACTIVE`, `INACTIVE`)

---

## 3. Configurable Vendor Questionnaire Versioning Framework

A dynamic metadata-driven framework replacing hardcoded eligibility columns. To maintain legal and audit compliance, questionnaires are strictly versioned.

### 3.1 `QuestionnaireTemplate` & Versioning
- `QuestionnaireTemplate`:
  - `id`: UUID (PK)
  - `title`: VARCHAR(255) (e.g., *Vendor Registration Profile*, *High-Value Tender Eligibility*)
  - `context_type`: ENUM (`ONBOARDING`, `TENDER_ELIGIBILITY`)
- `QuestionnaireTemplateVersion`:
  - `id`: UUID (PK)
  - `template_id`: FK -> `QuestionnaireTemplate.id`
  - `version_number`: Integer
  - `status`: ENUM (`DRAFT`, `PUBLISHED`, `ARCHIVED`)
  - `published_at`: Datetime
- `Question`:
  - `id`: UUID (PK)
  - `template_version_id`: FK -> `QuestionnaireTemplateVersion.id`
  - `question_text`: TEXT
  - `question_type`: ENUM (`TEXT`, `NUMBER`, `CURRENCY`, `BOOLEAN`, `FILE_UPLOAD`)
  - `is_required`: BOOLEAN
  - `display_order`: Integer
  - `validation_rules`: JSON
  - `options`: JSON Array
  - `units`: VARCHAR(32)
  - `evidence_required`: BOOLEAN
  - `applicable_financial_year`: VARCHAR(16)
  - `applicable_location`: VARCHAR(128)

### 3.2 `QuestionnaireResponse` & `QuestionResponse`
- `QuestionnaireResponse`:
  - `id`: UUID (PK)
  - `vendor_id`: FK -> `Vendor.id`
  - `template_version_id`: FK -> `QuestionnaireTemplateVersion.id` (Locks the exact version responded to)
  - `status`: ENUM (`DRAFT`, `SUBMITTED`, `EVALUATED`)
- `QuestionResponse`:
  - `id`: UUID (PK)
  - `response_id`: FK -> `QuestionnaireResponse.id`
  - `question_id`: FK -> `Question.id`
  - `response_value_text`: TEXT
  - `response_value_numeric`: Decimal
  - `response_value_boolean`: BOOLEAN
  - `evidence_document_id`: FK -> `Document.id`
  - `evaluator_verified`: BOOLEAN

---

## 4. Vendor Core Profile & External Prospects

### 4.1 `Vendor` (Core Organization Identity)
- `id`: UUID (PK)
- `legal_name`, `trade_name`, `company_type`, `year_established`
- `business_registration_number`, `pan`, `gstin`, `is_msme`, `cin_number`, `iec_number`, `website`
- Links to `VendorContact`, `VendorAddress`. All extended eligibility/financial history is managed via `QuestionnaireResponse` linking to specific `QuestionnaireTemplateVersion`s.

### 4.2 `ExternalVendorProspect`
- Independent table for external web discovery results.
- `discovery_status`: `EXTERNAL_PROSPECT`
- `verification_status`: `NOT_VERIFIED`

---

## 5. Relational Dynamic BOQ Versioning Model

The BOQ is fully relational, avoiding giant JSON blobs for core structural data. A published BOQVersion is strictly immutable. Revisions mandate the creation of a new version.

- `BOQ`: Container for the entire bill of quantities.
  - `id`: UUID (PK)
  - `title`: VARCHAR(255)
- `BOQVersion`: Snapshot version for amendment tracking.
  - `id`: UUID (PK)
  - `boq_id`: FK -> `BOQ.id`
  - `version_number`: Integer
  - `status`: ENUM (`DRAFT`, `INTERNAL_REVIEW`, `FINALIZED`, `PUBLISHED_IN_TENDER`, `AMENDED`)
  - `published_at`: Datetime (Once populated, the version and all its children are immutable)
- `BOQSection`: Logical grouping (e.g., *Oxygen Supply System*).
  - `id`: UUID (PK)
  - `boq_version_id`: FK -> `BOQVersion.id`
  - `section_name`: VARCHAR(255)
- `BOQItem`: Represents the relational line item.
  - `id`: UUID (PK)
  - `boq_section_id`: FK -> `BOQSection.id`
  - `item_code`: VARCHAR(64)
  - `description`: TEXT
  - `quantity`: Decimal(12, 3)
  - `uom`: VARCHAR(32)
  - `contingency_percentage`: Decimal(5, 2)
  - `schema_version_id`: FK -> `CategorySchemaVersion.id`
- `BOQValue`: Handles category-specific dynamic attributes linked to a `BOQItem`.
  - `id`: UUID (PK)
  - `boq_item_id`: FK -> `BOQItem.id`
  - `attribute_key`: VARCHAR(128)
  - `attribute_value`: TEXT

---

## 6. Tender, Sealed Quotation & Bid Opening Event

### 6.1 `TenderBidOpeningEvent` (First-Class Entity)
Formalizes the unsealing of shielded quotation data. Pricing remains inaccessible until the FINANCIAL opening event.
- `id`: UUID (PK)
- `tender_id`: FK -> `Tender.id`
- `opening_type`: ENUM (`TECHNICAL`, `FINANCIAL`, `BOTH`)
- `requested_by`: FK -> `User.id`
- `committee_members`: JSON Array of Staff User IDs
- `authorized_by`: FK -> `User.id`
- `requested_at`: Datetime
- `opened_at`: Datetime
- `reason_remarks`: TEXT
- `status`: ENUM (`PENDING`, `AUTHORIZED`, `OPENED`, `CANCELLED`)
- `audit_event_id`: UUID

### 6.2 `VendorQuotation`
- `id`: UUID (PK)
- `tender_id`, `vendor_id`
- `status`: `DRAFT`, `SUBMITTED`, `LOCKED_SEALED`
- `canonical_submission_payload`: JSON (Canonical snapshot of the submission)
- `submission_sha256_hash`: VARCHAR(64) (Immutable content hash)
- `server_hmac_seal`: VARCHAR(64) (Cryptographic tamper-evident integrity seal)

---

## 7. AI Document Extraction & Evidence Traceability

### 7.1 `AIExtractionRecord`
Ensures every extracted field is highly traceable to its exact origin in a document.
- `id`: UUID (PK)
- `source_document_id`: UUID
- `source_document_version_id`: UUID
- `target_entity_type`, `target_entity_id`
- `field_name`: VARCHAR(64)
- `ai_extracted_raw_value`: TEXT
- `confidence_score`: Float
- `source_page_number`: Integer
- `source_section`: VARCHAR(128)
- `source_text_snippet`: TEXT
- `source_bounding_box`: JSON
- `is_human_modified`: BOOLEAN Default `False`
- `human_corrected_value`: TEXT (Original AI value remains preserved in `ai_extracted_raw_value`)
- `modified_by_user_id`: FK
- `created_at`: Timestamp
