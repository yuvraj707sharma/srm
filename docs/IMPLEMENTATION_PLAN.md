# Phased Implementation Plan

## JECRC Hospital & Medical College — Supply Chain & Tender Procurement Portal

---

## 1. Roadmap Strategy & Sequential Phase Structure

To ensure systematic, test-driven development without architectural regressions, implementation follows a strict **14-phase sequence**. 

For the current expected scale (~700–800 vendors), the architecture relies on a clean modular monolith—no unnecessary microservices, event buses, Kubernetes, or complex distributed infrastructures are included.

The MVP scope focuses strictly on the core procurement lifecycle up to Purchase Order generation (Phases 0 to 10), explicitly deferring post-award delivery tracking to a subsequent phase.

```
+----------------------------------------------------------------------------------------------------+
|                                    14-PHASE IMPLEMENTATION ROADMAP                                 |
+----------------------------------------------------------------------------------------------------+
| Phase 0: Environment + Foundation (FastAPI + Next.js + MySQL + Storage Base)                      |
| Phase 1: Authentication + RBAC                                                                    |
| Phase 2: Vendor Registration + Vendor Profile + Documents (Versioned Questionnaires)              |
| Phase 3: Vendor Catalog + AI Extraction + Semantic Search (Vector Abstraction)                    |
| Phase 4: Product Requirements + Approval + Dynamic Relational BOQ (Strict Versioning)             |
| Phase 5: Tender + Vendor Invitations                                                              |
| Phase 6: Vendor Quotation + Submission Lock + Formalized Bid Opening Event                        |
| Phase 7: AI Quotation Extraction + Evidence Traceability                                          |
| Phase 8: Technical + Financial Evaluation + Comparative Statement Matrix                          |
| Phase 9: Shortlisting + Meetings + Negotiation Rounds                                             |
| Phase 10: Award + Purchase Order (MVP Core Scope Complete)                                        |
| Phase 11: External Vendor Discovery (Decoupled Web Discovery Engine)                              |
| Phase 12: Delivery Tracking (GRN/Milestones) + Reports + Procurement Copilot                      |
| Phase 13: Security + Performance + Production Hardening                                           |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Detailed Phase Breakdown

---

### Phase 0: Environment + Foundation
**Objective**: Establish local developer toolchain, configuration loader, database connection pool, storage abstractions, and frontend base template.
- **Deliverables**: FastAPI monolith, Pydantic settings (`GEMINI_MODEL`, DB URL), SQLAlchemy 2.0 Async, Alembic, Next.js 14+ setup. `VectorSearchService` abstraction layer defined.

### Phase 1: Authentication + RBAC
**Objective**: Build secure user authentication and granular role-based authorization across institutional staff and external vendors.

### Phase 2: Vendor Registration + Vendor Profile + Documents
**Objective**: Implement the vendor registration wizard utilizing the dynamic, strictly versioned questionnaire framework.
- **Deliverables**: `QuestionnaireTemplate` -> `QuestionnaireTemplateVersion` -> `Question` schema engines. Vendor statutory document uploads with MIME/size validation. Responses must lock to specific template versions.

### Phase 3: Vendor Catalog + AI Extraction + Semantic Search
**Objective**: Ingest vendor product catalogs early, extract structured items via Gemini AI with citation evidence, index vectors, and provide semantic search.
- **Deliverables**: Catalog upload, OCR parsing, AI structured extraction (advisory only), and `VectorSearchService` integration for semantic queries.

### Phase 4: Product Requirements + Approval + Dynamic BOQ
**Objective**: Build the generic Product Master, versioned category schemas, and relational BOQ engine.
- **Deliverables**: Generic `Product` master table without hardcoded category fields. `Category` -> `CategorySchema` -> `CategorySchemaVersion` engine. Relational hierarchy: `BOQ` -> `BOQVersion` -> `BOQSection` -> `BOQItem` -> `BOQValue`. Immutable published BOQVersions.

### Phase 5: Tender + Vendor Invitations
**Objective**: Build tender publishing, corrigenda versioning, and vendor invitation workflows.

### Phase 6: Vendor Quotation + Submission Lock + Bid Opening
**Objective**: Provide an isolated vendor quotation workspace with canonical submission sealing, deadline time-locking, and formalized bid-opening gates.
- **Deliverables**: Cryptographic tamper-evident submission integrity (SHA-256 + HMAC seal). First-class `TenderBidOpeningEvent` implementation keeping pricing shielded until the Financial opening.

### Phase 7: AI Quotation Extraction + Evidence
**Objective**: Multimodal ingestion of vendor quotation PDFs/Excel sheets with granular evidence traceability.
- **Deliverables**: Extraction records explicitly mapping `document_id`, `document_version_id`, `page`, `source_text_snippet`, and `bounding_box`. Human corrections preserve the original AI value.

### Phase 8: Technical + Financial Evaluation + Comparison
**Objective**: Programmatically generate the institutional Comparative Statement Matrix, execute technical compliance scoring, and rank bids deterministically.
- **Deliverables**: Deterministic Python math engine for totals, taxes, and L1/T1 ranking.

### Phase 9: Shortlisting + Meetings + Negotiation
**Objective**: Track multi-round vendor negotiations, record meeting minutes, and capture revised price offers.

### Phase 10: Award + Purchase Order
**Objective**: Finalize tender awards, issue standard Purchase Orders, and manage post-award amendments. *(MVP Core Scope Complete)*.

### Phase 11: External Vendor Discovery
**Objective**: Provide a decoupled search console to discover external market suppliers from public web sources without contaminating verified vendor data.

### Phase 12: Delivery Tracking + Reports + Procurement Copilot
**Objective**: Implement post-award execution tracking (PO Acknowledgement, GRN, Delivery Milestones) and institutional analytics.

### Phase 13: Security + Performance + Production Hardening
**Objective**: Execute end-to-end load testing, security audits, and production readiness certification.
