# Security, Compliance & Data Governance Specification

## JECRC Hospital & Medical College — Supply Chain & Tender Procurement Portal

---

## 1. Security Architecture & Threat Model

The **JECRC Hospital Supply Chain & Tender Portal** processes sensitive commercial bids, proprietary medical engineering designs, multi-year audited financial records, and institutional purchase commitments. The security architecture guarantees **strict multi-tenant vendor isolation**, **cryptographic non-repudiation and tamper-evidence**, **blind quotation confidentiality**, and **zero-trust input validation**.

---

## 2. Multi-Tenant Vendor Isolation & Strict Row-Level Segregation

### 2.1 Logical Tenancy & Query Interception
- **Tenant Scope**: Each vendor organization represents an isolated logical tenant.
- **Repository-Level Filter**: Every database query originating from a vendor user automatically injects the tenant isolation filter:
  ```python
  # Mandatory tenant enforcement in Data Access Layer
  if current_user.is_vendor:
      query = query.filter(Model.vendor_id == current_user.vendor_id)
  ```
- **Zero Cross-Vendor Visibility**: Vendors can only access their own profile, documents, product catalogs, invited tenders, and submitted quotations. Under no circumstances can a vendor query or discover another vendor's bids, prices, or documents.

### 2.2 Strict Segregation of Verified vs External Prospects
- The **Registered Vendor Database** contains only onboarded, verified suppliers.
- The **External Vendor Discovery Engine** queries public web sources into a completely segregated `external_vendor_prospects` table.
- External prospects are permanently tagged `EXTERNAL PROSPECT - NOT VERIFIED` and can never appear in internal registered vendor searches without explicit administrative verification.

---

## 3. Quotation Confidentiality & Scheduled Bid Opening Gates

### 3.1 Blind Bidding Protection
- **Pre-Opening Shielding**: Prior to the scheduled **Financial Bid Opening Event**, quotation unit rates, tax amounts, and total values are cryptographically shielded and inaccessible to technical evaluators and general staff.
- **Opening Event Gate**: Opening requires a multi-member committee sign-off event recorded in `tender_bid_opening_events` post-deadline.

---

## 4. Cryptographic Submission Sealing & Immutability

### 4.1 Submission Integrity Protocol
When a vendor submits a quotation:
1. **Canonicalization**: The system serializes the complete quotation (line item unit rates, model numbers, compliance statements, delivery terms, payment terms, and uploaded file SHA-256 hashes) into a deterministic canonical JSON string.
2. **Content Hash**: Computes the immutable SHA-256 hash over the canonical JSON payload:
   $$\text{PayloadHash} = \text{SHA256}(\text{CanonicalPayload})$$
3. **Server HMAC Seal**: Generates a server-side HMAC seal using an environment-managed signing key:
   $$\text{ServerSeal} = \text{HMAC-SHA256}(\text{SUBMISSION\_SECRET\_KEY}, \text{PayloadHash} + \text{Timestamp})$$
4. **Digital Bid Receipt**: Issues a verifiable receipt containing the `submission_number`, `submission_sha256_hash`, `server_hmac_seal`, and UTC timestamp.
5. **Deadline Lockdown**: At `submission_deadline_at`, all quotations transition to state `LOCKED_SEALED`. All mutation endpoints return HTTP 423 (Locked).

> [!IMPORTANT]
> **Legal Disclaimer & Boundary**: The submission seal is an **application-level cryptographic tamper-evident seal and audit receipt**. It provides cryptographic evidence that a bid has not been altered post-submission, but is explicitly not represented as a statutory digital signature (e.g. DSC / PKI token under the Information Technology Act).

---

## 5. Context-Aware File Upload & Storage Security

### 5.1 Permitted File Types by Context
| Upload Context | Allowed Extensions | MIME Types Allowed | Max Size |
| :--- | :--- | :--- | :--- |
| **Vendor Statutory & Financial Docs** | `.pdf`, `.jpg`, `.jpeg`, `.png` | `application/pdf`, `image/jpeg`, `image/png` | 15 MB |
| **Vendor Product Catalogs** | `.pdf`, `.xlsx`, `.xls`, `.csv`, `.docx` | `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | 50 MB |
| **Tender Specs & Corrigenda** | `.pdf`, `.xlsx`, `.docx` | `application/pdf`, spreadsheet, word | 35 MB |
| **Vendor Quotations & Compliance** | `.pdf`, `.xlsx`, `.xls`, `.csv`, `.docx` | `application/pdf`, spreadsheet, word | 35 MB |

### 5.2 Multi-Stage Ingress Pipeline
1. **Filename Sanitization**: Client filenames are stripped of dangerous characters (`..`, `/`, `\`, null bytes) and saved under randomized UUID-based paths.
2. **Magic Byte / Header Verification**: Inspects raw binary magic bytes (`python-magic`) to block disguised executables (e.g. `.exe` renamed to `.pdf`).
3. **Integrity Checksum**: Computes SHA-256 hash immediately upon upload and records it in database metadata.
4. **Malware Scanning Hook**: Asynchronous hook for ClamAV / antivirus daemon inspection prior to permanent storage.
5. **Gated Document Streaming**: Files are stored outside the web root and served exclusively through authenticated streaming endpoints (`/api/v1/documents/{id}/stream`) with short-lived signed tokens (TTL: 5 min).

---

## 6. Authentication, Session & Secrets Security

### 6.1 Authentication & Passwords
- **Password Hashing**: Argon2id (`memory_cost=65536`, `time_cost=3`, `parallelism=4`) with cryptographically secure unique per-user salt.
- **Session Tokens**: Short-lived (15 min) stateless JWT access tokens + long-lived (7 days) `HttpOnly`, `Secure`, `SameSite=Strict` refresh cookies with token rotation.
- **Rate Limiting**: 5 failed login attempts triggers a 15-minute lockout and IP rate-limiting.

### 6.2 Environment Variable Secrets Management
- All secrets are loaded strictly from environment variables via Pydantic Settings:
  - `DATABASE_URL`
  - `JWT_SECRET_KEY`
  - `SUBMISSION_SECRET_KEY`
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (e.g. `gemini-1.5-pro`, `gemini-2.0-flash` — never hardcoded)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
  - `STORAGE_PATH`
- `.env` files are strictly excluded from version control via `.gitignore`. A clean `.env.example` is maintained.

---

## 7. AI Safety & Prompt Injection Guardrails

### 7.1 Advisory & Extraction Boundaries
Google Gemini AI operates with **zero write permissions** across all transactional databases. It cannot:
- Modify master or transactional records
- Compute official arithmetic totals or tax sums
- Modify technical or financial scores
- Select tender winners or approve vendors
- Authorize or issue Purchase Orders

### 7.2 Prompt Injection Defense
Vendor catalogs and quotations represent untrusted third-party text. To prevent prompt injection:
- Prompts use strict XML delimiter boundaries:
  ```
  <untrusted_document_content>
  {{ document_text }}
  </untrusted_document_content>
  ```
- Gemini is invoked strictly with structured Pydantic JSON response schemas.
- Extracted figures are validated with strict regex and type validators before being presented in the human-in-the-loop review interface.

---

## 8. Immutable Chained Audit Logging

- **Append-Only Table**: `audit_logs` table has database-level `UPDATE` and `DELETE` revoked.
- **Chained HMAC Verification**: Every entry records `event_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `pre_snapshot`, `post_snapshot`, `ip_address`, and a chained HMAC hash linking to the previous record, ensuring tamper-evident non-repudiation.
