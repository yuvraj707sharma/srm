import pytest
import pytest_asyncio
import io
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.vendor import VendorOrganization
from app.models.document import Document, DocumentVersion
from app.models.questionnaire import (
    QuestionnaireTemplate,
    QuestionnaireTemplateVersion,
    Question
)

@pytest_asyncio.fixture
async def vendor_a(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_a@test.com")
    org = VendorOrganization(
        legal_name="Vendor Alpha Corp",
        organization_type="Private Limited",
        country="India",
        status="DRAFT",
        verification_status="UNVERIFIED"
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org


@pytest_asyncio.fixture
async def vendor_b(db_session: AsyncSession, create_test_user):
    user, token = await create_test_user(email="vendor_b@test.com")
    org = VendorOrganization(
        legal_name="Vendor Beta LLC",
        organization_type="LLC",
        country="USA",
        status="DRAFT",
        verification_status="UNVERIFIED"
    )
    db_session.add(org)
    await db_session.flush()
    user.vendor_organization_id = org.id
    await db_session.commit()
    return user, token, org


@pytest_asyncio.fixture
async def published_template(db_session: AsyncSession):
    template = QuestionnaireTemplate(
        title="Medical Supplier Qualification",
        context_type="ONBOARDING"
    )
    db_session.add(template)
    await db_session.flush()

    v1 = QuestionnaireTemplateVersion(
        template_id=template.id,
        version_number=1,
        status="PUBLISHED"
    )
    db_session.add(v1)
    await db_session.flush()

    q1 = Question(
        template_version_id=v1.id,
        question_text="Years in business",
        question_type="NUMBER",
        is_required=True,
        display_order=1
    )
    q2 = Question(
        template_version_id=v1.id,
        question_text="Do you have ISO 13485 certification?",
        question_type="BOOLEAN",
        is_required=True,
        evidence_required=True,
        display_order=2
    )
    q3 = Question(
        template_version_id=v1.id,
        question_text="Company description",
        question_type="TEXT",
        is_required=False,
        display_order=3
    )
    db_session.add_all([q1, q2, q3])
    await db_session.commit()
    return template, v1, [q1, q2, q3]


# =========================================================================
# 1. DOCUMENT TESTS & TENANT ISOLATION
# =========================================================================

@pytest.mark.asyncio
async def test_document_upload_listing_and_download(async_client: AsyncClient, vendor_a):
    _, token_a, _ = vendor_a

    # Upload Doc
    file_bytes = b"%PDF-1.4 Mock PDF Content for Document Test"
    files = {"file": ("registration.pdf", io.BytesIO(file_bytes), "application/pdf")}
    resp = await async_client.post(
        "/api/v1/vendor/documents?document_type=COMPANY_REGISTRATION",
        files=files,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200
    doc_id = resp.json()["document_id"]
    version_id = resp.json()["version_id"]

    # List Docs
    list_resp = await async_client.get("/api/v1/vendor/documents", headers={"Authorization": f"Bearer {token_a}"})
    assert list_resp.status_code == 200
    docs = list_resp.json()
    assert len(docs) >= 1
    assert docs[0]["id"] == doc_id
    assert docs[0]["latest_version"]["version_number"] == 1

    # Get Single Doc
    get_resp = await async_client.get(f"/api/v1/vendor/documents/{doc_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_resp.status_code == 200
    assert len(get_resp.json()["versions"]) == 1

    # Download Doc
    down_resp = await async_client.get(f"/api/v1/vendor/documents/{doc_id}/download", headers={"Authorization": f"Bearer {token_a}"})
    assert down_resp.status_code == 200
    assert down_resp.content == file_bytes
    assert down_resp.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_cross_tenant_document_access_rejection(async_client: AsyncClient, vendor_a, vendor_b):
    _, token_a, _ = vendor_a
    _, token_b, _ = vendor_b

    # Vendor A uploads a document
    file_bytes = b"Vendor A Secret PDF Content"
    files = {"file": ("vendor_a_secret.pdf", io.BytesIO(file_bytes), "application/pdf")}
    resp = await async_client.post(
        "/api/v1/vendor/documents?document_type=FINANCIAL_AUDIT",
        files=files,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    doc_a_id = resp.json()["document_id"]

    # Vendor B attempts to read Vendor A's document details -> 404
    resp_b_get = await async_client.get(
        f"/api/v1/vendor/documents/{doc_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b_get.status_code == 404

    # Vendor B attempts to download Vendor A's document -> 404
    resp_b_down = await async_client.get(
        f"/api/v1/vendor/documents/{doc_a_id}/download",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b_down.status_code == 404

    # Vendor B attempts to bump version on Vendor A's document -> 404
    files2 = {"file": ("exploit.pdf", io.BytesIO(b"Exploit"), "application/pdf")}
    resp_b_bump = await async_client.post(
        f"/api/v1/vendor/documents?document_type=FINANCIAL_AUDIT&document_id={doc_a_id}",
        files=files2,
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b_bump.status_code == 404


# =========================================================================
# 2. QUESTIONNAIRE TESTS & EVIDENCE SECURITY
# =========================================================================

@pytest.mark.asyncio
async def test_questionnaire_lifecycle_and_version_locking(
    async_client: AsyncClient, 
    vendor_a, 
    published_template
):
    _, token_a, _ = vendor_a
    _, v1, questions = published_template
    q_years, q_iso, q_desc = questions

    # 1. Fetch available templates
    t_resp = await async_client.get("/api/v1/vendor/questionnaires/templates", headers={"Authorization": f"Bearer {token_a}"})
    assert t_resp.status_code == 200
    assert len(t_resp.json()) >= 1

    # 2. Start questionnaire
    start_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{v1.id}/responses",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert start_resp.status_code == 200
    response_id = start_resp.json()["id"]
    assert start_resp.json()["status"] == "DRAFT"

    # 3. Upload a valid evidence document by Vendor A
    files = {"file": ("iso_certificate.pdf", io.BytesIO(b"ISO 13485 CERT"), "application/pdf")}
    up_resp = await async_client.post(
        "/api/v1/vendor/documents?document_type=QUALITY_CERTIFICATION",
        files=files,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    doc_ver_a_id = up_resp.json()["version_id"]

    # 4. Save Draft answers
    save_payload = {
        "answers": [
            {"question_id": q_years.id, "value": 10},
            {"question_id": q_iso.id, "value": True},
            {"question_id": q_desc.id, "value": "Leading healthcare provider."}
        ],
        "evidence": {
            q_iso.id: [doc_ver_a_id]
        }
    }
    save_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{response_id}/save",
        json=save_payload,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert save_resp.status_code == 200, f"save_resp failed: {save_resp.json()}"

    # 5. Submit response
    sub_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{response_id}/submit",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert sub_resp.status_code == 200
    assert sub_resp.json()["new_status"] == "SUBMITTED"

    # 6. Verify submitted response is IMMUTABLE (cannot edit after submit)
    edit_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{response_id}/save",
        json=save_payload,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert edit_resp.status_code == 400
    assert "Cannot modify" in edit_resp.json()["error"]["message"]


@pytest.mark.asyncio
async def test_cross_tenant_questionnaire_evidence_attachment_rejected(
    async_client: AsyncClient,
    vendor_a,
    vendor_b,
    published_template
):
    _, token_a, _ = vendor_a
    _, token_b, _ = vendor_b
    _, v1, questions = published_template
    _, q_iso, _ = questions

    # Vendor B uploads a secret document
    files_b = {"file": ("vendor_b_iso.pdf", io.BytesIO(b"Vendor B ISO"), "application/pdf")}
    doc_resp_b = await async_client.post(
        "/api/v1/vendor/documents?document_type=QUALITY_CERTIFICATION",
        files=files_b,
        headers={"Authorization": f"Bearer {token_b}"}
    )
    doc_ver_b_id = doc_resp_b.json()["version_id"]

    # Vendor A starts a questionnaire
    start_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{v1.id}/responses",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    resp_a_id = start_resp.json()["id"]

    # Vendor A tries to attach Vendor B's DocumentVersion as evidence -> MUST FAIL (403)
    exploit_payload = {
        "answers": [{"question_id": q_iso.id, "value": True}],
        "evidence": {q_iso.id: [doc_ver_b_id]}
    }
    exploit_resp = await async_client.post(
        f"/api/v1/vendor/questionnaires/{resp_a_id}/save",
        json=exploit_payload,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert exploit_resp.status_code == 403


# =========================================================================
# 3. CATALOG TESTS & VERSIONING
# =========================================================================

@pytest.mark.asyncio
async def test_catalog_creation_and_cross_tenant_isolation(
    async_client: AsyncClient,
    vendor_a,
    vendor_b
):
    _, token_a, _ = vendor_a
    _, token_b, _ = vendor_b

    # Vendor A uploads catalog document
    files = {"file": ("catalog_2026.pdf", io.BytesIO(b"Catalog 2026 PDF"), "application/pdf")}
    doc_resp_a = await async_client.post(
        "/api/v1/vendor/documents?document_type=CATALOG_DOCUMENT",
        files=files,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    doc_ver_a_id = doc_resp_a.json()["version_id"]

    # Vendor A creates catalog
    cat_payload = {
        "title": "Surgical Instruments Catalog 2026",
        "description": "Full catalogue of stainless steel surgical tools",
        "catalog_year": "2026",
        "document_version_id": doc_ver_a_id
    }
    cat_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json=cat_payload,
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert cat_resp.status_code == 200
    catalog_id = cat_resp.json()["id"]

    # Vendor A lists catalogs
    list_resp = await async_client.get("/api/v1/vendor/catalogs", headers={"Authorization": f"Bearer {token_a}"})
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # Vendor B attempts to read Vendor A's catalog -> 404
    resp_b_cat = await async_client.get(
        f"/api/v1/vendor/catalogs/{catalog_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b_cat.status_code == 404

    # Vendor B attempts to create a catalog using Vendor A's document -> 403
    exploit_cat = {
        "title": "Stolen Catalog",
        "document_version_id": doc_ver_a_id
    }
    exploit_resp = await async_client.post(
        "/api/v1/vendor/catalogs",
        json=exploit_cat,
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert exploit_resp.status_code == 403


# =========================================================================
# 4. ADMIN INSPECTION & RBAC
# =========================================================================

@pytest.mark.asyncio
async def test_admin_inspection_and_verification(
    async_client: AsyncClient,
    create_test_user,
    vendor_a,
    db_session: AsyncSession
):
    # Admin User with 'vendors.approve'
    _, admin_token = await create_test_user(email="super_admin@jecrc.ac.in", roles=["ADMIN"])
    _, token_a, org_a = vendor_a

    # Admin lists vendors
    v_list = await async_client.get("/api/v1/admin/vendors", headers={"Authorization": f"Bearer {admin_token}"})
    assert v_list.status_code == 200
    assert any(v["id"] == org_a.id for v in v_list.json())

    # Admin inspects vendor documents
    doc_insp = await async_client.get(
        f"/api/v1/admin/vendors/{org_a.id}/documents",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert doc_insp.status_code == 200

    # Vendor profile moves to SUBMITTED
    org_a.status = "SUBMITTED"
    await db_session.commit()

    # Admin approves vendor
    appr_resp = await async_client.post(
        f"/api/v1/admin/vendors/{org_a.id}/verify?action=approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert appr_resp.status_code == 200
    assert appr_resp.json()["vendor_status"] == "APPROVED"
    assert appr_resp.json()["verification_status"] == "VERIFIED"
