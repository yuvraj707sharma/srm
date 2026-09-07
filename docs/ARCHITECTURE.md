# System Architecture Specification

## JECRC Hospital & Medical College — Supply Chain & Tender Procurement Portal

---

## 1. Executive Overview & Architectural Philosophy

The **JECRC Hospital Supply Chain Management & Tender Procurement Portal** is an enterprise-grade, secure, modular-monolith web platform engineered for institutional procurement across medical colleges, multi-specialty hospital blocks, diagnostic centers, and hospital campus infrastructure.

The platform spans all procurement categories (Medical Equipment, Pharmaceuticals, Consumables, IT, HVAC, Civil, MGPS, Furniture, Services, etc.).

### Core Architectural Principles
1. **Modular Monolith First**: Single unified backend and frontend codebase organized into strictly isolated domain modules.
2. **Generic Product Master with Dynamic Attribute Schemas**: Core product entities maintain clean generic identifiers. Category-specific technical attributes (e.g., MGPS pipe dimensions, Radiology specs, pharmaceutical dosage) are driven dynamically via configurable attribute schemas, keeping the base product table completely generic.
3. **Configurable Vendor Questionnaire & Profile**: A robust questionnaire framework drives vendor onboarding and tender-specific eligibility. It handles dynamic questions (e.g., project experience thresholds, financial turnover by year) without hardcoding logic into the base vendor schema.
4. **Vector Search Abstraction**: MySQL serves as the authoritative source of truth for relational data. Semantic catalog search is managed by a pluggable `VectorSearchService` abstraction, allowing for simple initial implementations (like local indices) with the ability to scale to Qdrant or OpenSearch as needed.
5. **Strict Segregation of Registered vs External Vendor Discovery**: Internal catalog search queries only verified, registered vendors. A separate, decoupled **External Vendor Discovery** module searches public web data, strictly tagging results as `EXTERNAL PROSPECT - NOT VERIFIED`.
6. **Confidential Bidding & First-Class Bid Opening Event**: Sealed vendor submissions with application-level cryptographic tamper-evident hashes. Commercial pricing is cryptographically shielded and inaccessible to evaluators until a formalized, logged **Bid Opening Event** triggers post-deadline.
7. **Deterministic Financial Core with Advisory AI**: Pure deterministic Python math for all arithmetic, GST calculations, dynamic BOQ costings, L1/T1 rankings, and workflow state transitions. Google Gemini AI serves strictly as an **advisory and extraction assistant** (configured via `GEMINI_MODEL`), maintaining complete citation provenance (`document_id`, `page`, `snippet`, `bounding_box`, `confidence`) and immutable logging of human overrides.
8. **Pragmatic Scaling for Institutional Scale**: MySQL 8.0+ engine optimized for 800+ vendor profiles, concurrent uploads, background document OCR, large Excel sheets, and background jobs.

---

## 2. System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                           CLIENT TIER                                              |
|                                                                                                    |
|   +-------------------------------------------------+  +---------------------------------------+   |
|   |         JECRC SCM Internal Staff Portal         |  |         Vendor Self-Service Portal    |   |
|   |  - Product Master & Category Schemas            |  |  - Registration via Questionnaires    |   |
|   |  - Dynamic BOQ Builder & Requisitions           |  |  - Statutory & Financial Doc Uploads  |   |
|   |  - Tender Publishing & Corrigenda Engine        |  |  - Hospital Experience Portfolio      |   |
|   |  - Catalog Search & AI Catalog Explorer         |  |  - Catalog PDF / Excel Ingestion      |   |
|   |  - External Prospect Discovery Engine           |  |  - Tender Workspace & Bid Submission  |   |
|   |  - Bid Opening Event Management                 |  |  - Cryptographic Receipt Generation   |   |
|   |  - Comparative Statement & Evaluation           |  |  - Negotiation Counter-Offers         |   |
|   |  - Negotiation Tracker & PO Generator           |  |                                       |   |
|   |  Next.js 14+ (App Router) / TypeScript / CSS    |  |  Next.js 14+ (App Router) / TS / CSS  |   |
|   +-------------------------------------------------+  +---------------------------------------+   |
+---------------------------------------------------|------------------------------------------------+
                                                    | HTTPS (REST API / JSON)
                                                    v
+----------------------------------------------------------------------------------------------------+
|                                      API & APPLICATION TIER                                        |
|                                         FastAPI (Python)                                           |
|                                                                                                    |
|  +-----------------------------------------------------------------------------------------------+ |
|  | Middleware: CORS | Rate Limiting | Auth Context | Tenant Isolation Filter | Audit Event Logger | |
|  +-----------------------------------------------------------------------------------------------+ |
|                                                                                                    |
|  +------------------------------------+  +-------------------------------------------------------+ |
|  |      API Presentation Layer        |  |               Domain Application Services             | |
|  |  - /api/v1/auth                    |  |  - AuthService         - TenderService                | |
|  |  - /api/v1/vendors                 |  |  - VendorService       - QuotationService             | |
|  |  - /api/v1/questionnaires          |  |  - QuestionnaireService- BidOpeningEventService       | |
|  |  - /api/v1/vendor-catalogs         |  |  - CatalogAIService    - EvaluationEngineService      | |
|  |  - /api/v1/external-discovery      |  |  - ExtDiscoveryService - NegotiationService           | |
|  |  - /api/v1/products                |  |  - ProductService      - POService                    | |
|  |  - /api/v1/category-schemas        |  |  - SchemaEngineService - VectorSearchService          | |
|  |  - /api/v1/requisitions & boqs     |  |  - BOQEngineService    - AuditService                 | |
|  |  - /api/v1/tenders & quotations    |  +-------------------------------------------------------+ |
|  |  - /api/v1/evaluations             |  +-------------------------------------------------------+ |
|  |  - /api/v1/negotiations            |  |               Pure Deterministic Engines              | |
|  |  - /api/v1/purchase-orders         |  |  - Comparative Statement & Tax Calculator (GST/L1)    | |
|  +------------------------------------+  |  - Cryptographic Submission Integrity Sealer          | |
|                                          +-------------------------------------------------------+ |
+---------------------------------------------------|------------------------------------------------+
                                                    |
         +------------------------------------------+------------------------------------+
         |                                          |                                    |
         v                                          v                                    v
+-----------------------+              +--------------------------+             +--------------------+
|     DATA TIER         |              |       STORAGE TIER       |             |   INTELLIGENCE &   |
|     MySQL 8.0+        |              |  Local / MinIO / S3 Store|             |  EXTERNAL SERVICES |
|                       |              |                          |             +--------------------+
| - Relational Entities |              | - /vendors/{id}/profile/ |             | - Google Gemini API|
| - BOQ Hierarchies     |              | - /vendors/{id}/catalog/ |             |   (Configurable    |
| - Questionnaires      |              | - /tenders/{id}/specs/   |             |    GEMINI_MODEL)   |
| - Immutable Audits    |              | - /quotations/{id}/bids/ |             | - Pluggable Vector |
| - Source of Truth     |              | - Immutable raw archive  |             |   Backend          |
+-----------------------+              +--------------------------+             +--------------------+
```

---

## 3. Frontend Architecture

### 3.1 Framework & Core Layout
- **Framework**: Next.js 14+ (App Router) with TypeScript.
- **Design Paradigm**: Minimal, high-contrast, accessible institutional design using CSS Modules / Vanilla CSS.
- **Audience**: Built for doctors, department heads, storekeepers, procurement officers, finance auditors, and external vendor teams.

### 3.2 Dual Portal Architecture
1. **Institutional SCM Staff Portal** (`/portal`):
   - **Product Master & Category Schema Studio**: Manage generic products and dynamic attribute schemas.
   - **Vendor Directory & Questionnaire Builder**: Review vendor responses and define eligibility criteria.
   - **Catalog Intelligence & Semantic Explorer**: Search internal registered vendor products with specification match scoring.
   - **External Vendor Discovery**: Dedicated search console to discover external market prospects (clearly flagged `EXTERNAL PROSPECT - NOT VERIFIED`).
   - **Requisition & Dynamic BOQ Builder**: Multi-level department approval and relational BOQ configuration.
   - **Tender Lifecycle Manager**: Publishing, corrigenda, vendor invitations.
   - **Bid Opening Event Console**: Formalized event trigger for opening technical/financial bids.
   - **Comparative Statement Workspace**: Multi-vendor line-item matrix.
   - **Negotiation Tracker & PO Generator**: Multi-round pricing negotiations and PO generation.
2. **Vendor Self-Service Portal** (`/vendor`):
   - **Onboarding via Questionnaires**: Complete mandatory profile, statutory, and hospital experience questionnaires.
   - **Catalog Management**: Upload PDF, Excel, CSV, or DOCX product catalogs with automated AI extraction review.
   - **Tender Workspace & Quotations**: View public/invited tenders, build quotes, upload docs, and receive cryptographic submission receipts.
   - **Negotiation Portal**: Receive counter-offers and submit revised quotations.

---

## 4. Backend Architecture

### 4.1 Layered Modular-Monolith Structure
- **Framework**: FastAPI (Python).
- **ORM & DB**: SQLAlchemy 2.0 Async targeting MySQL. Alembic for migrations.
- **Service Abstractions**: Use of Interfaces/Abstract Base Classes for components like `VectorSearchService` to ensure a pluggable architecture (allowing swapping between local indices, Qdrant, OpenSearch, etc.).

---

## 5. Domain Engine Highlights

### 5.1 Generic Product Master
The core `Product` table contains only universal fields (e.g., item code, generic name, UOM, HSN, tax category). Category-specific technical details (like pharmaceutical dosage, MGPS dimensions, refrigerator temp) are strictly managed via a configurable schema mechanism linked to the product category.

### 5.2 Configurable Questionnaire Framework
A dynamic, metadata-driven framework for gathering vendor data and assessing eligibility:
- Supports various question types (Number, Currency, Boolean, Text, File Upload).
- Features context awareness (applicable financial years, location parameters, required evidence).
- Powers both initial vendor onboarding and tender-specific technical qualification criteria.

### 5.3 Vector Search Abstraction
- **Source of truth**: MySQL retains all vendor, product, catalog metadata, and extracted text.
- **Vector Index**: A `VectorSearchService` abstraction handles semantic embedding indexing and retrieval. It is designed to be pluggable, starting simple (e.g., a local embedding index or lightweight vector store) while allowing future upgrades (Qdrant, OpenSearch) as scale demands.

---

## 6. Sealed Bidding & Scheduled Bid-Opening Architecture

```
+-----------------------------------------------------------------------------+
|                     SEALED BID SUBMISSION & OPENING LIFECYCLE               |
+-----------------------------------------------------------------------------+
| 1. Vendor Bid Submission                                                    |
|    - Vendor enters BOQ rates & uploads technical compliance sheets          |
|    - System creates Canonical JSON Payload                                  |
|    - System computes SHA-256 content hash + server-side HMAC seal            |
|    - Generates Immutable Submission Record + Application-Level Audit Receipt|
|    - Status: SUBMITTED (Cryptographically Sealed)                           |
|                                                                             |
| 2. Submission Deadline Lockdown                                             |
|    - Timestamp reaches tender submission_deadline_at                        |
|    - Quotations automatically lock (zero modifications permitted)           |
|                                                                             |
| 3. Formalized Bid Opening Event                                             |
|    - First-class entity: TenderBidOpeningEvent                              |
|    - SCM Committee triggers Technical Opening -> Evaluates Compliance       |
|    - SCM Committee triggers Financial Opening -> Prices unshielded          |
|    - Only after Financial Opening is Pricing accessible to the system       |
+-----------------------------------------------------------------------------+
```

---

## 7. AI Advisory Engine & Document Extraction

- **Configuration**: Powered by Gemini API, dynamically configured via the `GEMINI_MODEL` environment variable.
- **Advisory Boundary**: AI operates in a strictly read/extract capacity. It cannot calculate authoritative totals, modify core records, change scores, select winners, or approve workflows.
- **Evidence Provenance**: All extracted fields (e.g., from vendor catalogs or quotes) must trace back to a `document_id`, `document_version_id`, `page`, `section`, `source_text_snippet`, `bounding_box`, and `confidence_score`. Any human corrections to extracted data will preserve the original AI extraction values.
