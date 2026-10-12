import io
import json
import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import pymupdf as fitz  # PyMuPDF
from google import genai
from google.genai import types

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.boq import BOQ, BOQItem, BOQSubmission, BOQSubmissionItem, BOQVendorTarget
from app.models.vendor import VendorOrganization

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# 1. FILE TEXT & TABLE EXTRACTION (Format-Agnostic)
# -------------------------------------------------------------------------

def extract_content_from_file(file_bytes: bytes, filename: str) -> str:
    """
    Extracts raw text and tabular representations from PDF, Excel, or Word documents.
    """
    lower_name = filename.lower()
    
    if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        return _extract_from_excel(file_bytes)
    elif lower_name.endswith(".pdf"):
        return _extract_from_pdf(file_bytes)
    elif lower_name.endswith(".docx") or lower_name.endswith(".doc"):
        return _extract_from_docx(file_bytes)
    else:
        # Try UTF-8 text decode
        try:
            return file_bytes.decode("utf-8")
        except Exception:
            return str(file_bytes[:20000])


def _extract_from_docx(file_bytes: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        lines = []
        for p in doc.paragraphs:
            if p.text.strip():
                lines.append(p.text.strip())
        for table in doc.tables:
            lines.append("\n--- TABLE ---")
            for row in table.rows:
                row_text = [cell.text.strip() for cell in row.cells]
                if any(row_text):
                    lines.append("\t".join(row_text))
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Docx extraction warning: {e}")
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return str(file_bytes[:20000])



def _extract_from_excel(file_bytes: bytes) -> str:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        lines.append(f"\n--- SHEET: {sheet_name} ---")
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                # Clean and join cells with tab delimiter
                cleaned_cells = [
                    str(c).strip() if c is not None else "" 
                    for c in row
                ]
                lines.append("\t".join(cleaned_cells))
    return "\n".join(lines)


def _extract_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    lines = []
    total_chars = 0
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text("text")
        total_chars += len(text.strip())
        lines.append(f"\n--- PDF PAGE {page_idx + 1} ---")
        lines.append(text)

    # Scanned PDF check: if digital text is virtually empty, run OCR
    if len(doc) > 0 and (total_chars / max(len(doc), 1)) < 30:
        logger.info(f"PDF appears to be scanned ({total_chars} text chars across {len(doc)} pages). Running OCR...")
        ocr_lines = []
        try:
            import pytesseract
            from PIL import Image
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                pix = page.get_pixmap(dpi=200)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                ocr_text = pytesseract.image_to_string(img)
                ocr_lines.append(f"\n--- OCR PDF PAGE {page_idx + 1} ---")
                ocr_lines.append(ocr_text)
            if "".join(ocr_lines).strip():
                return "\n".join(ocr_lines)
        except Exception as ocr_err:
            logger.warning(f"Local Tesseract OCR skipped: {ocr_err}")

    return "\n".join(lines)


# -------------------------------------------------------------------------
# 2. GEMINI AI EXTRACTION FOR ARBITRARY BOQs
# -------------------------------------------------------------------------

BOQ_EXTRACTION_SYSTEM_PROMPT = """You are an expert Procurement Engineer and Technical Quantity Surveyor for Healthcare, Infrastructure, and University Projects.
Your task is to parse ANY tender, Bill of Quantities (BOQ), technical specification, project scope document, or requisition and extract EVERY SINGLE EQUIPMENT, COMPONENT, WORK PACKAGE, OR SERVICE DELIVERABLE into a structured JSON list of line items so vendors can quote unit prices.

EXTRACTION RULES:

1. TABULAR BOQs & RATE LISTS:
   - If the document contains structured tables with columns (Item No, Description, Qty, UOM, Rate, etc.), extract each row faithfully.
   - Map standard fields:
     * Item Code / Ref / Sl No -> item_code
     * Item Name / Description / Scope -> item_name
     * Technical Specs / Brand / Make -> specifications
     * Quantity -> quantity (float, default 1.0)
     * Unit of Measure (SM3, Nos, Set, Lot, KL, Mtrs, Monthly, One time) -> uom
     * Category / Section -> category

2. SPECIFICATION DOCUMENTS, PROPOSALS & SCOPE OF WORK (NON-TABULAR / NARRATIVE):
   - If the document is a scope of work, technical setup document, proposal, or equipment schedule (e.g., LMO Plant Room Setup, HVAC, Medical Equipment, Turnkey projects) WITHOUT a formal table:
   - INTELLIGENTLY EXTRACT EVERY EQUIPMENT, SYSTEM COMPONENT, AND DELIVERABLE as an item. For example:
     * Main Storage Tank (e.g. 20 KL to 30 KL) -> item_name: "LMO Storage Tank (20 KL - 30 KL)", qty: 1, uom: "Nos" / "Set"
     * Ambient Vaporizer -> item_name: "Ambient Vaporizer Unit", qty: 1, uom: "Nos"
     * Pressure Reducing Station -> item_name: "Pressure Reducing Station", qty: 1, uom: "Set"
     * Backup Cylinder Manifold System -> item_name: "Backup Manifold System", qty: 1, uom: "Set"
     * Reserve Cylinder Bank -> item_name: "Emergency Reserve Cylinder Bank", qty: 1, uom: "Lot"
     * MGPS Pipeline Integration -> item_name: "MGPS Pipeline Network Integration", qty: 1, uom: "Job"
     * Valve Box System & Area Alarms -> item_name: "Valve Box & Alarm Panel System", qty: 1, uom: "Set"
     * Civil & Foundation Work (RCC, Fencing) -> item_name: "Civil Work, RCC Foundation & Fencing", qty: 1, uom: "Job"
     * PESO License Work & Statutory Approvals -> item_name: "PESO Licensing & Fire Approvals", qty: 1, uom: "Job"
     * Testing & Commissioning -> item_name: "Testing, Commissioning & Validation", qty: 1, uom: "Job"
   - Include any stated capacities, dimensions, standards (e.g. HTM 02-01, NFPA 99C, ISO 7396-1), or technical details in `specifications`.
   - Set quantity to the stated number or 1.0, and uom to appropriate units (Nos, Set, Job, Lot, SM3, Monthly).

3. DYNAMIC ATTRIBUTES & CUSTOM COLUMNS:
   - If items have extra parameters (e.g. Bed counts, gas flow, dimensions, power rating, shaft), extract them into `attributes` as key-value pairs and list the unique keys in `custom_columns`. If standard, leave `custom_columns` empty `[]`.

4. NEVER RETURN AN EMPTY "items" LIST:
   - Always extract all distinct deliverables, materials, and services mentioned in the text so bidders have clear lines to quote.

JSON SCHEMA:
{
  "tender_number": string or null,
  "title": string,
  "department": string or null,
  "description": string or null,
  "custom_columns": [string, ...],
  "items": [
    {
      "item_code": string,
      "item_name": string,
      "specifications": string or null,
      "quantity": number,
      "uom": string,
      "category": string or null,
      "target_price": number or null,
      "attributes": {}
    }
  ]
}
"""

def _split_text_into_chunks(text: str, max_chunk_chars: int = 6000) -> List[str]:
    """
    Splits multi-page document text into manageable chunks while preserving page boundaries or paragraphs.
    """
    if len(text) <= max_chunk_chars:
        return [text]

    # 1. If explicit PDF page delimiters are present, chunk by page
    if "--- PDF PAGE " in text:
        pages = text.split("--- PDF PAGE ")
        chunks = []
        current_chunk = []
        current_len = 0

        for page in pages:
            if not page.strip():
                continue
            page_str = "--- PDF PAGE " + page
            if current_len + len(page_str) > max_chunk_chars and current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = [page_str]
                current_len = len(page_str)
            else:
                current_chunk.append(page_str)
                current_len += len(page_str)

        if current_chunk:
            chunks.append("\n".join(current_chunk))

        if chunks:
            return chunks

    # 2. Otherwise (Word docs, raw OCR, long text), chunk by line boundaries
    lines = text.split("\n")
    chunks = []
    current_chunk = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1
        if current_len + line_len > max_chunk_chars and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_len = line_len
        else:
            current_chunk.append(line)
            current_len += line_len

    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks if chunks else [text]


async def extract_boq_with_gemini(raw_text: str, boq_type: str = "COMMERCIAL") -> Dict[str, Any]:
    """
    Sends document text to Gemini AI to extract normalized BOQ items and custom columns.
    Uses concurrent multi-pass chunking for large documents to extract 100% of line items instantly.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in settings.")

    import asyncio

    client = genai.Client(api_key=api_key)
    preferred_model = getattr(settings, "GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash"
    candidates = [preferred_model, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    seen = set()
    models = [m for m in candidates if not (m in seen or seen.add(m))]

    chunks = _split_text_into_chunks(raw_text, max_chunk_chars=7500)
    logger.info(f"BOQ document split into {len(chunks)} chunk(s) for concurrent extraction (Type: {boq_type}).")

    def _process_chunk_sync(chunk_idx: int, chunk_text: str) -> Dict[str, Any]:
        prompt = f"Tender Type: {boq_type}. Please extract all BOQ line items and custom column attributes from this tender document section/chunk (Chunk {chunk_idx}/{len(chunks)}):\n\n{chunk_text}"
        config = types.GenerateContentConfig(
            system_instruction=BOQ_EXTRACTION_SYSTEM_PROMPT,
            temperature=0.1,
            response_mime_type="application/json",
            max_output_tokens=32768
        )

        max_retries = 5
        response_text = None
        last_error = None

        for attempt in range(max_retries):
            model_name = models[attempt % len(models)]
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[prompt],
                    config=config
                )
                response_text = response.text.strip()
                if response_text:
                    break  # Success
            except Exception as e:
                last_error = e
                logger.warning(f"Chunk {chunk_idx} attempt {attempt + 1}/{max_retries} failed using {model_name}: {e}")
                import time
                time.sleep(1.5 * (attempt + 1))


        if not response_text:
            logger.error(f"Chunk {chunk_idx} extraction failed after {max_retries} attempts: {last_error}")
            return {}

        # Clean code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]

        response_text = response_text.strip()

        # Repair truncated JSON if output token limit was reached
        if not response_text.endswith("}"):
            last_item_end = response_text.rfind("}")
            if last_item_end != -1 and '"items"' in response_text:
                response_text = response_text[:last_item_end + 1] + "\n  ]\n}"

        try:
            return json.loads(response_text)
        except Exception as parse_err:
            logger.error(f"Failed to parse chunk {chunk_idx} JSON: {parse_err}. Raw snippet: {response_text[:200]}")
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    repaired = match.group(0).rsplit("}", 1)[0] + "}\n  ]\n}"
                    try:
                        return json.loads(repaired)
                    except Exception:
                        return {}
            return {}

    # Run chunk processing concurrently in parallel using worker threads
    tasks = [
        asyncio.to_thread(_process_chunk_sync, chunk_idx, chunk)
        for chunk_idx, chunk in enumerate(chunks, start=1)
    ]
    results = await asyncio.gather(*tasks)

    all_raw_items = []
    custom_columns_set = set()
    extracted_title = None
    extracted_dept = None
    seen_item_keys = set()

    for chunk_data in results:
        if not chunk_data:
            continue

        if chunk_data.get("title") and not extracted_title:
            extracted_title = chunk_data["title"]
        if chunk_data.get("department") and not extracted_dept:
            extracted_dept = chunk_data["department"]
        if isinstance(chunk_data.get("custom_columns"), list):
            for col in chunk_data["custom_columns"]:
                if col:
                    custom_columns_set.add(str(col))

        for item in chunk_data.get("items", []):
            name = (item.get("item_name") or "").strip()
            if not name:
                continue
            code = (item.get("item_code") or "").strip()
            cat = (item.get("category") or "").strip()
            dedup_key = f"{cat}:{code}:{name}"
            if dedup_key in seen_item_keys:
                continue
            seen_item_keys.add(dedup_key)
            all_raw_items.append(item)

    normalized_items = []
    for idx, item in enumerate(all_raw_items, start=1):
        name = (item.get("item_name") or "").strip()
        code = item.get("item_code") or str(idx)
        qty = float(item.get("quantity") or 1.0)
        uom = (item.get("uom") or "Nos").strip()
        specs = item.get("specifications") or ""
        cat = item.get("category") or extracted_dept or "General"
        target_p = float(item["target_price"]) if item.get("target_price") is not None else None
        attrs = item.get("attributes") or {}

        normalized_items.append({
            "item_code": str(code),
            "item_name": name,
            "specifications": specs,
            "quantity": qty,
            "uom": uom,
            "category": cat,
            "target_price": target_p,
            "attributes": attrs
        })

    return {
        "title": extracted_title or "Medical College & Hospital Procurement BOQ",
        "department": extracted_dept or "General Procurement",
        "description": f"AI Extracted BOQ containing {len(normalized_items)} line items.",
        "custom_columns": list(custom_columns_set),
        "items": normalized_items
    }



# -------------------------------------------------------------------------
# 3. EXCEL BIDDING TEMPLATE GENERATION
# -------------------------------------------------------------------------

def generate_boq_excel_template(boq: BOQ, items: Optional[List[BOQItem]] = None) -> io.BytesIO:
    """
    Creates a pre-formatted Excel template (.xlsx) for vendors to fill in quoted prices and models.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Vendor Bidding Sheet"
    ws.views.sheetView[0].showGridLines = True

    # Styling definitions
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    light_blue_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    accent_green_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    
    title_font = Font(name="Calibri", size=15, bold=True, color="1E3A8A")
    meta_font = Font(name="Calibri", size=10, bold=False, color="475569")
    bold_meta_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    calc_font = Font(name="Calibri", size=10, bold=True, color="0F172A")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Title & Metadata
    ws.merge_cells("A1:J1")
    ws["A1"] = f"JECRC MEDICAL COLLEGE & HOSPITAL - TENDER BIDDING FORM"
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")

    ws["A2"] = "Tender Number:"
    ws["A2"].font = bold_meta_font
    ws["B2"] = boq.tender_number or f"JECRC-BOQ-{boq.id[:8].upper()}"
    ws["B2"].font = meta_font

    ws["D2"] = "Project / BOQ Title:"
    ws["D2"].font = bold_meta_font
    ws["E2"] = boq.title
    ws["E2"].font = meta_font

    ws["A3"] = "Department:"
    ws["A3"].font = bold_meta_font
    ws["B3"] = boq.department or "Procurement"
    ws["B3"].font = meta_font

    ws["D3"] = "Submission Deadline:"
    ws["D3"].font = bold_meta_font
    ws["E3"] = boq.deadline_at.strftime("%d-%b-%Y %H:%M UTC") if boq.deadline_at else "Strict Time Lock"
    ws["E3"].font = meta_font

    # Dynamic custom columns
    custom_cols: List[str] = []
    if boq.custom_columns_json:
        try:
            custom_cols = json.loads(boq.custom_columns_json)
        except Exception:
            custom_cols = []

    # Table Header Row (Row 5)
    base_headers = ["S.No.", "Item Code", "Equipment / Item Description", "Specifications", "Qty", "UOM"]
    vendor_headers = ["Quoted Make & Model", "Unit Price (INR)", "Total Amount (INR)", "Technical Compliance (COMPLIANT/DEVIATION)", "Vendor Remarks"]
    all_headers = base_headers + custom_cols + vendor_headers

    header_row = 5
    for col_idx, header in enumerate(all_headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = navy_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[header_row].height = 28

    # Populate Line Items
    row_idx = 6
    boq_items = items if items is not None else getattr(boq, "items", [])
    for i, item in enumerate(boq_items, start=1):
        attrs = {}
        if item.attributes_json:
            try:
                attrs = json.loads(item.attributes_json)
            except Exception:
                attrs = {}

        # Base columns
        ws.cell(row=row_idx, column=1, value=i).font = data_font
        ws.cell(row=row_idx, column=2, value=item.item_code or str(i)).font = data_font
        ws.cell(row=row_idx, column=3, value=item.item_name).font = data_font
        ws.cell(row=row_idx, column=4, value=item.specifications or "").font = data_font
        qty_cell = ws.cell(row=row_idx, column=5, value=item.quantity)
        qty_cell.font = data_font
        qty_cell.alignment = Alignment(horizontal="center")
        ws.cell(row=row_idx, column=6, value=item.uom).font = data_font
        ws.cell(row=row_idx, column=6).alignment = Alignment(horizontal="center")

        curr_col = 7
        # Custom columns
        for col_name in custom_cols:
            val = attrs.get(col_name, "")
            ws.cell(row=row_idx, column=curr_col, value=str(val)).font = data_font
            curr_col += 1

        # Vendor fillable columns: Make/Model, Unit Price, Total (Formula), Compliance, Remarks
        ws.cell(row=row_idx, column=curr_col, value="").font = data_font # Make & Model
        price_cell = ws.cell(row=row_idx, column=curr_col + 1, value=0.0) # Unit Price
        price_cell.font = data_font
        price_cell.number_format = "#,##0.00"
        price_cell.fill = light_blue_fill

        # Excel formula for Total Amount: = E{row} * H{row}
        qty_col_letter = get_column_letter(5)
        price_col_letter = get_column_letter(curr_col + 1)
        total_cell = ws.cell(row=row_idx, column=curr_col + 2, value=f"={qty_col_letter}{row_idx}*{price_col_letter}{row_idx}")
        total_cell.font = calc_font
        total_cell.number_format = "#,##0.00"
        total_cell.fill = accent_green_fill

        ws.cell(row=row_idx, column=curr_col + 3, value="COMPLIANT").font = data_font # Compliance
        ws.cell(row=row_idx, column=curr_col + 4, value="").font = data_font # Remarks

        for c in range(1, len(all_headers) + 1):
            ws.cell(row=row_idx, column=c).border = thin_border

        row_idx += 1

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


# -------------------------------------------------------------------------
# 4. VENDOR UPLOADED BID PARSER (Excel / PDF via AI)
# -------------------------------------------------------------------------

async def parse_vendor_submission_file(
    boq: BOQ,
    file_bytes: bytes,
    filename: str
) -> Dict[str, Any]:
    """
    Parses a vendor's submitted bid file (Excel or PDF quotation) and maps quotes to BOQ items.
    """
    lower_name = filename.lower()
    
    if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        return _parse_vendor_excel_bid(boq, file_bytes)
    else:
        # PDF or text bid: send to Gemini to extract quoted prices mapped to BOQ items
        return await _parse_vendor_pdf_bid_with_gemini(boq, file_bytes, filename)


def _parse_vendor_excel_bid(boq: BOQ, file_bytes: bytes) -> Dict[str, Any]:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active

    # Build lookup map of BOQ items by code and by normalized item_name
    boq_by_code: Dict[str, BOQItem] = {}
    boq_by_name: Dict[str, BOQItem] = {}
    for item in boq.items:
        if item.item_code:
            boq_by_code[str(item.item_code).strip().lower()] = item
        clean_name = re.sub(r'[^a-zA-Z0-9]', '', item.item_name.lower())
        boq_by_name[clean_name] = item

    # Find header row
    header_row_idx = None
    col_map: Dict[str, int] = {}
    for r in range(1, min(15, ws.max_row + 1)):
        row_vals = [str(cell.value or '').strip().lower() for cell in ws[r]]
        # Look for price or unit price or quoted
        if any("price" in v or "unit" in v or "rate" in v for v in row_vals):
            header_row_idx = r
            for c_idx, val in enumerate(row_vals, start=1):
                if "item code" in val or "s.no" in val or "sl. no" in val or "ref" in val:
                    col_map["code"] = c_idx
                elif "description" in val or "particular" in val or "equipment" in val or "item name" in val:
                    col_map["name"] = c_idx
                elif "make" in val or "model" in val:
                    col_map["model"] = c_idx
                elif ("unit price" in val or "quoted price" in val or "rate" in val) and "total" not in val:
                    col_map["unit_price"] = c_idx
                elif "total" in val and ("amount" in val or "price" in val):
                    col_map["total_amount"] = c_idx
                elif "compliance" in val:
                    col_map["compliance"] = c_idx
                elif "remark" in val:
                    col_map["remarks"] = c_idx
            break

    parsed_items = []
    if header_row_idx:
        for r in range(header_row_idx + 1, ws.max_row + 1):
            row_cells = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
            if not any(row_cells):
                continue
            
            code_val = str(ws.cell(row=r, column=col_map.get("code", 1)).value or "").strip()
            name_val = str(ws.cell(row=r, column=col_map.get("name", 2)).value or "").strip()
            
            # Match item
            matched_item: Optional[BOQItem] = None
            if code_val and code_val.lower() in boq_by_code:
                matched_item = boq_by_code[code_val.lower()]
            elif name_val:
                clean_n = re.sub(r'[^a-zA-Z0-9]', '', name_val.lower())
                matched_item = boq_by_name.get(clean_n)

            # If still not found, try by sequential index if code is numeric
            if not matched_item and code_val.isdigit():
                idx = int(code_val) - 1
                if 0 <= idx < len(boq.items):
                    matched_item = boq.items[idx]

            if not matched_item:
                continue

            # Extract numeric prices safely
            unit_price_raw = ws.cell(row=r, column=col_map.get("unit_price", 0)).value if "unit_price" in col_map else 0.0
            try:
                unit_price = float(str(unit_price_raw).replace(",", "").strip())
            except Exception:
                unit_price = 0.0

            total_amount = unit_price * matched_item.quantity
            make_model = str(ws.cell(row=r, column=col_map.get("model", 0)).value or "").strip() if "model" in col_map else None
            compliance = str(ws.cell(row=r, column=col_map.get("compliance", 0)).value or "COMPLIANT").strip() if "compliance" in col_map else "COMPLIANT"
            remarks = str(ws.cell(row=r, column=col_map.get("remarks", 0)).value or "").strip() if "remarks" in col_map else None

            parsed_items.append({
                "boq_item_id": matched_item.id,
                "quoted_unit_price": unit_price,
                "total_amount": total_amount,
                "make_model_quoted": make_model,
                "technical_compliance": compliance,
                "vendor_remarks": remarks
            })

    # Fill any unquoted BOQ items with 0.0
    quoted_ids = {p["boq_item_id"] for p in parsed_items}
    for item in boq.items:
        if item.id not in quoted_ids:
            parsed_items.append({
                "boq_item_id": item.id,
                "quoted_unit_price": 0.0,
                "total_amount": 0.0,
                "make_model_quoted": "",
                "technical_compliance": "NON_COMPLIANT",
                "vendor_remarks": "Not quoted in sheet"
            })

    sub_total = sum(item["total_amount"] for item in parsed_items)
    gst_percent = 18.0
    gst_amount = sub_total * (gst_percent / 100.0)
    grand_total = sub_total + gst_amount

    return {
        "items": parsed_items,
        "sub_total": sub_total,
        "gst_percent": gst_percent,
        "gst_amount": gst_amount,
        "grand_total": grand_total,
        "payment_terms": "As per tender terms",
        "delivery_time": "4-6 Weeks",
        "submission_type": "EXCEL_UPLOAD"
    }


async def _parse_vendor_pdf_bid_with_gemini(boq: BOQ, file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Deep Gemini AI extraction of vendor submitted quotation document (PDF / Word / Excel).
    Processes long, multi-page bids in chunks to guarantee 100% data extraction without token truncation.
    Extracts line item quotes, model numbers, plant/tank specifications, and all commercial clauses.
    For COMMERCIAL/LMO type BOQs, extracts the full commercial structure: gas rate, monthly charge, one-time charges.
    """
    raw_text = extract_content_from_file(file_bytes, filename)
    api_key = settings.GEMINI_API_KEY
    client = genai.Client(api_key=api_key)

    boq_type = getattr(boq, "boq_type", "COMMERCIAL") or "COMMERCIAL"

    items_manifest = [
        {"id": item.id, "item_code": item.item_code, "item_name": item.item_name, "quantity": item.quantity, "uom": item.uom}
        for item in boq.items
    ]

    # Chunk long documents page-by-page so all pages and lines are parsed without truncation
    chunks = _split_text_into_chunks(raw_text, max_chunk_chars=7500)
    logger.info(f"Vendor quote '{filename}' ({len(raw_text)} chars) split into {len(chunks)} chunk(s) for Gemini deep extraction.")

    models_to_try = [settings.GEMINI_MODEL or "gemini-3.7-flash", "gemini-3.6-flash"]

    merged_items_dict: Dict[str, Dict[str, Any]] = {}
    merged_commercial_terms: Dict[str, Any] = {}
    detected_model_no = None
    detected_tank_capacity = None
    detected_payment_terms = None
    detected_delivery_time = None
    detected_warranty_terms = None

    # COMMERCIAL-specific extracted fields
    detected_gas_rate_sm3 = None
    detected_gas_rate_kg = None
    detected_monthly_facility_charge = None
    detected_freight_charges = None
    detected_one_time_charges: list = []
    detected_minimum_volume = None

    # Build type-specific prompt instructions
    if boq_type == "COMMERCIAL":
        type_specific_instructions = """
IMPORTANT: This is a COMMERCIAL / LMO (Liquid Medical Oxygen) type quotation.
The vendor quote will typically contain these distinct sections - extract ALL of them:

SECTION A – RECURRING CHARGES (per unit supply):
  - Gas supply rate per SM3 / NM3 / KG / MT  (e.g. "Rs. 13 per sm3", "Rs. 10 per KG")
  - Monthly facility / rental / maintenance charge (e.g. "Rs. 10000 per Month")
  - Freight charges (usually NIL or a specific amount)

SECTION B – ONE-TIME CHARGES (capital / installation):
  - One-time installation / SITC charges (e.g. Rs. 75,000)
  - PESO / CCOE liaison / approval fees (e.g. Rs. 75,000)
  - License fee (e.g. Rs. 1,25,000 for 5 years)
  - Civil work charges
  - Any other one-time cost mentioned

SECTION C – COMMERCIAL TERMS:
  - Payment terms for gas bills (e.g. 30 days from invoice)
  - Payment terms for SITC (e.g. 50% advance, 50% on completion)
  - Minimum agreement tenure / LTA period (e.g. 7 years, 10 years)
  - Lock-in period
  - Price escalation clause (e.g. NIL / fixed / annual %)
  - Minimum monthly volume commitment

For BOQ ITEM MAPPING:
  - Use the GAS SUPPLY RATE (per SM3 or per KG) as the `quoted_unit_price` for any BOQ item about gas / oxygen / LMO supply.
  - Use the MONTHLY FACILITY CHARGE for BOQ items about facility / equipment / VIE / tank.
  - If there is ONLY ONE BOQ item, use the GAS SUPPLY RATE as its `quoted_unit_price`.
  - DO NOT use monthly facility charge as the primary item price unless there is no gas rate at all.
"""
        extra_json_fields = """
  "gas_supply_rate_per_sm3": number or null,
  "gas_supply_rate_per_kg": number or null,
  "monthly_facility_charge": number or null,
  "freight_charges": string or null,
  "minimum_volume": string or null,
  "one_time_charges": [
    {
      "name": string,
      "amount": number,
      "remarks": string or null
    }
  ],"""
    else:
        type_specific_instructions = ""
        extra_json_fields = ""

    for chunk_idx, chunk_text in enumerate(chunks, start=1):
        prompt = f"""You are an expert Procurement Auditor analyzing a vendor's submitted quotation / bid PDF document (Chunk {chunk_idx}/{len(chunks)}).
BOQ Type: {boq_type}
Master required BOQ items to match against:
{json.dumps(items_manifest, indent=2)}

Document chunk text:
{chunk_text}
{type_specific_instructions}

TASK:
1. Extract quoted unit price (INR), make & model, and compliance status for each BOQ item found. Match to the exact `boq_item_id`.
2. Extract Vendor details, Model/Registration No, Tank Capacity & Plant Location (especially for LMO / Cryogenic plants).
3. Extract Commercial terms:
   - payment_terms_sitc (e.g. 100% advance, 90% against LC)
   - payment_terms_gas (e.g. within 30 days)
   - delivery_time (e.g. 8 to 10 weeks)
   - warranty_terms (e.g. 2 years warranty + 5 years CMC)
   - agreement_tenure (e.g. 10 years, 5 years, 7 years)
   - lock_in_period (e.g. 10 years)
   - civil_work_scope (e.g. Hospital Scope)
   - price_escalation (e.g. Fixed for 2 years, 5% Y-o-Y, NIL)
   - mode_of_delivery (e.g. Weighment basis, Tanker)
   - minimum_expected_volume (e.g. 40,000 M3/month, NIL)

Return ONLY raw JSON (no markdown fences):
{{
  "model_no": string or null,
  "tank_capacity_location": string or null,
  "payment_terms": string or null,
  "delivery_time": string or null,
  "warranty_terms": string or null,{extra_json_fields}
  "commercial_terms": {{
    "payment_terms_sitc": string or null,
    "payment_terms_gas": string or null,
    "delivery_time": string or null,
    "warranty_terms": string or null,
    "agreement_tenure": string or null,
    "lock_in_period": string or null,
    "civil_work_scope": string or null,
    "price_escalation": string or null,
    "mode_of_delivery": string or null,
    "minimum_expected_volume": string or null
  }},
  "items": [
    {{
      "boq_item_id": string,
      "quoted_unit_price": number,
      "make_model_quoted": string or null,
      "technical_compliance": "COMPLIANT" or "DEVIATION" or "NON_COMPLIANT",
      "vendor_remarks": string or null,
      "gst_percent": number or null
    }}
  ]
}}
"""
        chunk_json = None
        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        response_mime_type="application/json"
                    )
                )
                if response.text and response.text.strip():
                    raw_clean = response.text.strip()
                    if raw_clean.startswith("```json"):
                        raw_clean = raw_clean[7:]
                    if raw_clean.startswith("```"):
                        raw_clean = raw_clean[3:]
                    if raw_clean.endswith("```"):
                        raw_clean = raw_clean[:-3]
                    chunk_json = json.loads(raw_clean.strip())
                    break
            except Exception as e:
                logger.warning(f"Vendor bid chunk {chunk_idx} parse failed on {model_name}: {e}")

        if not chunk_json:
            continue

        # Merge extracted items
        for it in chunk_json.get("items", []):
            b_id = it.get("boq_item_id")
            if not b_id:
                continue
            unit_p = float(it.get("quoted_unit_price") or 0.0)
            if b_id in merged_items_dict and merged_items_dict[b_id].get("quoted_unit_price", 0.0) > 0 and unit_p == 0.0:
                continue
            merged_items_dict[b_id] = it

        # Merge headers and terms
        if chunk_json.get("model_no") and not detected_model_no:
            detected_model_no = chunk_json["model_no"]
        if chunk_json.get("tank_capacity_location") and not detected_tank_capacity:
            detected_tank_capacity = chunk_json["tank_capacity_location"]
        if chunk_json.get("payment_terms") and not detected_payment_terms:
            detected_payment_terms = chunk_json["payment_terms"]
        if chunk_json.get("delivery_time") and not detected_delivery_time:
            detected_delivery_time = chunk_json["delivery_time"]
        if chunk_json.get("warranty_terms") and not detected_warranty_terms:
            detected_warranty_terms = chunk_json["warranty_terms"]

        if isinstance(chunk_json.get("commercial_terms"), dict):
            for k, val in chunk_json["commercial_terms"].items():
                if val and not merged_commercial_terms.get(k):
                    merged_commercial_terms[k] = str(val)

        # COMMERCIAL-specific fields
        if boq_type == "COMMERCIAL":
            if chunk_json.get("gas_supply_rate_per_sm3") and not detected_gas_rate_sm3:
                try:
                    detected_gas_rate_sm3 = float(chunk_json["gas_supply_rate_per_sm3"])
                except Exception:
                    pass
            if chunk_json.get("gas_supply_rate_per_kg") and not detected_gas_rate_kg:
                try:
                    detected_gas_rate_kg = float(chunk_json["gas_supply_rate_per_kg"])
                except Exception:
                    pass
            if chunk_json.get("monthly_facility_charge") and not detected_monthly_facility_charge:
                try:
                    detected_monthly_facility_charge = float(chunk_json["monthly_facility_charge"])
                except Exception:
                    pass
            if chunk_json.get("freight_charges") and not detected_freight_charges:
                detected_freight_charges = str(chunk_json["freight_charges"])
            if chunk_json.get("minimum_volume") and not detected_minimum_volume:
                detected_minimum_volume = str(chunk_json["minimum_volume"])
            for ot in chunk_json.get("one_time_charges", []):
                # Deduplicate by name
                existing_names = {c.get("name", "").lower() for c in detected_one_time_charges}
                if ot.get("name", "").lower() not in existing_names:
                    detected_one_time_charges.append(ot)

    # For COMMERCIAL BOQ, if Gemini didn't map items correctly, do a smart re-mapping:
    # Use gas_supply_rate_per_sm3 as the primary unit price for all unmatched or zero-priced items.
    if boq_type == "COMMERCIAL" and detected_gas_rate_sm3:
        for boq_item in boq.items:
            existing = merged_items_dict.get(boq_item.id)
            
            item_name_lower = boq_item.item_name.lower()
            is_gas_item = any(kw in item_name_lower for kw in ["gas", "oxygen", "lmo", "o2", "sm3", "nm3", "liquid"])
            is_facility_item = any(kw in item_name_lower for kw in ["facility", "rental", "vie", "tank", "equipment"])
            
            if is_gas_item:
                merged_items_dict[boq_item.id] = {
                    "boq_item_id": boq_item.id,
                    "quoted_unit_price": detected_gas_rate_sm3,
                    "make_model_quoted": detected_model_no or "Liquid Medical Oxygen IP",
                    "technical_compliance": "COMPLIANT",
                    "vendor_remarks": f"Gas rate: ₹{detected_gas_rate_sm3}/SM3" + (f" (₹{detected_gas_rate_kg}/KG)" if detected_gas_rate_kg else "")
                }
            elif is_facility_item and detected_monthly_facility_charge:
                merged_items_dict[boq_item.id] = {
                    "boq_item_id": boq_item.id,
                    "quoted_unit_price": detected_monthly_facility_charge,
                    "make_model_quoted": detected_model_no or "",
                    "technical_compliance": "COMPLIANT",
                    "vendor_remarks": f"Monthly facility charge: ₹{detected_monthly_facility_charge}/month"
                }
            elif not existing:
                merged_items_dict[boq_item.id] = {
                    "boq_item_id": boq_item.id,
                    "quoted_unit_price": 0.0,
                    "make_model_quoted": "",
                    "technical_compliance": "COMPLIANT",
                    "vendor_remarks": ""
                }

    # Build final items matching boq.items
    parsed_items = []
    for boq_item in boq.items:
        it = merged_items_dict.get(boq_item.id)
        if it:
            unit_price = float(it.get("quoted_unit_price") or 0.0)
            tot = unit_price * boq_item.quantity
            gst_pct = float(it.get("gst_percent") if it.get("gst_percent") is not None else 18.0)
            parsed_items.append({
                "boq_item_id": boq_item.id,
                "quoted_unit_price": unit_price,
                "total_amount": tot,
                "make_model_quoted": it.get("make_model_quoted") or detected_model_no or "",
                "technical_compliance": it.get("technical_compliance") or "COMPLIANT",
                "vendor_remarks": it.get("vendor_remarks") or "",
                "gst_percent": gst_pct,
                "gst_amount": tot * (gst_pct / 100.0)
            })
        else:
            parsed_items.append({
                "boq_item_id": boq_item.id,
                "quoted_unit_price": 0.0,
                "total_amount": 0.0,
                "make_model_quoted": detected_model_no or "",
                "technical_compliance": "NON_COMPLIANT",
                "vendor_remarks": "Not found in quotation",
                "gst_percent": 18.0,
                "gst_amount": 0.0
            })

    sub_total = sum(i["total_amount"] for i in parsed_items)
    gst_percent = 0.0 # Replaced by line level GST
    gst_amount = sum(i["gst_amount"] for i in parsed_items)
    grand_total = sub_total + gst_amount

    # Build rich commercial breakdown for COMMERCIAL type
    commercial_breakdown = None
    if boq_type == "COMMERCIAL":
        one_time_total = sum(float(c.get("amount", 0)) for c in detected_one_time_charges)
        commercial_breakdown = {
            "gas_supply_rate_per_sm3": detected_gas_rate_sm3,
            "gas_supply_rate_per_kg": detected_gas_rate_kg,
            "monthly_facility_charge": detected_monthly_facility_charge,
            "freight_charges": detected_freight_charges or "NIL",
            "minimum_volume": detected_minimum_volume,
            "one_time_charges": detected_one_time_charges,
            "one_time_total": one_time_total,
        }

    raw_extraction = {
        "filename": filename,
        "boq_type": boq_type,
        "model_no": detected_model_no,
        "tank_capacity_location": detected_tank_capacity,
        "payment_terms": detected_payment_terms,
        "delivery_time": detected_delivery_time,
        "warranty_terms": detected_warranty_terms,
        "commercial_terms": merged_commercial_terms,
        "commercial_breakdown": commercial_breakdown,
        "items": parsed_items,
        "sub_total": sub_total,
        "grand_total": grand_total
    }

    return {
        "items": parsed_items,
        "sub_total": sub_total,
        "gst_percent": gst_percent,
        "gst_amount": gst_amount,
        "grand_total": grand_total,
        "model_no": detected_model_no,
        "tank_capacity_location": detected_tank_capacity,
        "payment_terms": detected_payment_terms or merged_commercial_terms.get("payment_terms_gas") or "As per quotation",
        "delivery_time": detected_delivery_time or merged_commercial_terms.get("delivery_time") or "As per quotation",
        "warranty_terms": detected_warranty_terms or merged_commercial_terms.get("warranty_terms") or "Standard 1 Year",
        "commercial_terms": merged_commercial_terms,
        "commercial_breakdown": commercial_breakdown,
        "raw_extraction": raw_extraction,
        "submission_type": "PDF_UPLOAD"
    }


# -------------------------------------------------------------------------
# 5. AI TECHNICAL SPEC AUDIT & DISCREPANCY DETECTION
# -------------------------------------------------------------------------


async def evaluate_submission_technical_compliance(
    boq: BOQ, 
    submission: BOQSubmission, 
    db: Optional[AsyncSession] = None
) -> Dict[str, Any]:
    """
    Evaluates vendor quoted make/models against tender BOQ specifications using Gemini AI.
    Detects any wrong info, spec downgrades, missing features, or inferior models.
    Updates technical_compliance and attributes_json for each line item, and overall technical_score.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.warning("GEMINI_API_KEY not configured. Skipping AI technical evaluation.")
        return {}

    client = genai.Client(api_key=api_key)
    model_name = settings.GEMINI_MODEL or "gemini-3.7-flash"

    boq_items_map = {item.id: item for item in boq.items}

    boq_manifest = []
    for item in boq.items:
        attrs = {}
        if item.attributes_json:
            try:
                attrs = json.loads(item.attributes_json)
            except Exception:
                attrs = {}
        boq_manifest.append({
            "boq_item_id": item.id,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "required_specifications": item.specifications or "",
            "quantity": item.quantity,
            "uom": item.uom,
            "attributes": attrs
        })

    vendor_manifest = []
    for si in submission.items:
        matched_boq = boq_items_map.get(si.boq_item_id)
        vendor_manifest.append({
            "submission_item_id": si.id,
            "boq_item_id": si.boq_item_id,
            "boq_item_name": matched_boq.item_name if matched_boq else "Item",
            "quoted_make_model": si.make_model_quoted or "",
            "quoted_unit_price": si.quoted_unit_price,
            "vendor_remarks": si.vendor_remarks or ""
        })

    prompt = f"""You are a Lead Quantity Surveyor, Chief Biomedical Engineer, and Hospital Procurement Auditor for JECRC Foundation Healthcare & University.
Conduct a rigorous Technical Specification Compliance Audit on this vendor's quoted equipment against our required tender BOQ specifications.

REQUIRED BOQ TENDER SPECIFICATIONS:
{json.dumps(boq_manifest, indent=2)}

VENDOR'S QUOTED ITEMS & MODELS:
{json.dumps(vendor_manifest, indent=2)}

AUDIT & DISCREPANCY DETECTION INSTRUCTIONS:
1. Thoroughly compare the vendor's quoted make, model, and remarks against the mandatory tender specifications for each item.
2. Actively identify and flag ANY wrong information, inferior models, spec downgrades, or missing mandatory features.
   Real Medical & Engineering Examples:
   - Requested 128-slice CT scanner, but vendor quoted a 16-slice or 32-slice scanner (e.g., GE Revolution ACT is only 16/32 slices) -> Critical non-compliance!
   - Requested 1.5T Wide Bore (70cm) MRI, but vendor quoted standard narrow 60cm bore (e.g., GE Signa Explorer) -> Spec downgrade!
   - Requested Full Field Digital Mammography with 3D Tomosynthesis, but vendor quoted 2D-only mammography (e.g., GE Senographe Crystal Nova) -> Missing critical clinical feature!
   - Requested 3-wing ceiling fan, but vendor quoted 4-wing (or vice versa).
   - Quoted model matches or exceeds all clinical parameters (e.g., Siemens Somatom go.Top, Siemens Magnetom Altea, Hologic Selenia Dimensions) -> COMPLIANT.
3. For each line item:
   - `submission_item_id`: string
   - `boq_item_id`: string
   - `technical_compliance`: "COMPLIANT" | "DEVIATION" | "NON_COMPLIANT"
   - `discrepancy_title`: short 3-8 word title (e.g. "Inferior Slices (16/32 vs 128 Required)", "Missing 3D Tomosynthesis Option", "Standard 60cm Bore vs 70cm Wide Bore", or "Fully Compliant")
   - `discrepancy_type`: "NONE" | "SPEC_MISMATCH" | "INFERIOR_MODEL" | "MISSING_FEATURE" | "CATEGORY_MISMATCH"
   - `risk_level`: "NONE" | "LOW" | "MEDIUM" | "HIGH"
   - `explanation`: 1-2 factual sentences comparing required spec vs quoted item
   - `action_recommended`: clear recommendation for procurement committee
   - `detected_specs`: summary of key specs detected in quoted model
4. Compute an overall `technical_score` (0.0 to 100.0) reflecting total technical suitability.
5. Provide `technical_notes` (2-3 sentences concise executive summary for the evaluation committee).

Return ONLY valid JSON matching this schema:
{{
  "technical_score": 85.0,
  "technical_notes": "Executive summary...",
  "items": [
    {{
      "submission_item_id": "string",
      "boq_item_id": "string",
      "technical_compliance": "COMPLIANT" | "DEVIATION" | "NON_COMPLIANT",
      "discrepancy_title": "string",
      "discrepancy_type": "string",
      "risk_level": "string",
      "explanation": "string",
      "action_recommended": "string",
      "detected_specs": "string"
    }}
  ]
}}
"""

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[prompt],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        resp_text = response.text.strip()
    except Exception as e:
        logger.warning(f"Error calling {model_name} for tech audit: {e}. Retrying with gemini-3.7-flash...")
        response = client.models.generate_content(
            model="gemini-3.7-flash",
            contents=[prompt],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        resp_text = response.text.strip()

    if resp_text.startswith("```json"):
        resp_text = resp_text[7:]
    if resp_text.startswith("```"):
        resp_text = resp_text[3:]
    if resp_text.endswith("```"):
        resp_text = resp_text[:-3]

    try:
        data = json.loads(resp_text.strip())
    except Exception as parse_err:
        logger.error(f"Failed to parse audit JSON: {parse_err}. Raw text: {resp_text[:300]}")
        match = re.search(r'\{.*\}', resp_text, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
        else:
            data = {"technical_score": 80.0, "technical_notes": "Technical review performed.", "items": []}

    item_results = {it.get("submission_item_id"): it for it in data.get("items", [])}
    boq_item_results = {it.get("boq_item_id"): it for it in data.get("items", [])}

    for si in submission.items:
        res_item = item_results.get(si.id) or boq_item_results.get(si.boq_item_id)
        if res_item:
            compliance = (res_item.get("technical_compliance") or "COMPLIANT").upper()
            if compliance not in ["COMPLIANT", "DEVIATION", "NON_COMPLIANT"]:
                compliance = "COMPLIANT"
            si.technical_compliance = compliance

            discrepancy_payload = {
                "title": res_item.get("discrepancy_title") or ("Fully Compliant" if compliance == "COMPLIANT" else "Specification Deviation"),
                "type": res_item.get("discrepancy_type") or ("NONE" if compliance == "COMPLIANT" else "SPEC_MISMATCH"),
                "risk_level": res_item.get("risk_level") or ("NONE" if compliance == "COMPLIANT" else "HIGH"),
                "explanation": res_item.get("explanation") or "",
                "action_recommended": res_item.get("action_recommended") or "",
                "detected_specs": res_item.get("detected_specs") or (si.make_model_quoted or "")
            }
            si.attributes_json = json.dumps(discrepancy_payload)

    submission.technical_score = float(data.get("technical_score", 85.0))
    submission.technical_notes = data.get("technical_notes") or "Specification compliance verified."

    if db:
        await db.commit()

    return data


def _generate_strategic_advisory(
    l1_vendor: Dict[str, Any], 
    t1_vendor: Dict[str, Any], 
    qcbs_rankings: List[Dict[str, Any]], 
    rows: List[Dict[str, Any]], 
    dq_vendors: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generates high-level executive award recommendations and alerts for the procurement committee.
    """
    if not l1_vendor:
        return {
            "status": "NO_BIDS",
            "headline": "No Bids Submitted or All Bidders Disqualified",
            "summary": "No active submissions available for this tender, or all bidders have been disqualified.",
            "badge": "Action Required",
            "recommended_vendor_id": None,
            "action_items": []
        }

    l1_non_comp = l1_vendor.get("non_compliant_count", 0)
    l1_dev = l1_vendor.get("deviation_count", 0)
    l1_tech_score = l1_vendor.get("technical_score", 0.0)
    t1_vendor_name = t1_vendor.get("vendor_name", "") if t1_vendor else ""

    dq_note = ""
    if dq_vendors:
        dq_names = ", ".join([v.get("vendor_name", "") for v in dq_vendors])
        dq_note = f"\nNote: {len(dq_vendors)} vendor(s) ({dq_names}) were disqualified and excluded from this evaluation."

    # Check for critical discrepancies in L1
    if l1_non_comp > 0 or l1_tech_score < 75.0:
        headline = f"Risk Alert: Commercial L1 ({l1_vendor['vendor_name']}) has Critical Technical Discrepancies"
        summary = (
            f"{l1_vendor['vendor_name']} is commercially the lowest bidder among remaining qualified vendors at ₹{l1_vendor['effective_total']:,.2f}, "
            f"but quoted {l1_non_comp} item(s) that fail mandatory tender specifications (Technical Score: {l1_tech_score}%). "
            f"In contrast, {t1_vendor_name} achieved the highest technical compliance ({t1_vendor.get('compliance_percentage', 0)}%) "
            f"at ₹{t1_vendor.get('effective_total', 0):,.2f}."
            f"{dq_note}"
        )
        status = "CRITICAL_L1_DISCREPANCY_ALERT"
        badge = "L1 Technical Risk Detected"
        action_items = [
            f"Issue immediate Technical Clarification notice to {l1_vendor['vendor_name']} requiring compliance on flagged items without increasing cost.",
            f"If {l1_vendor['vendor_name']} fails technical clarification, initiate commercial counter-offer to T1 bidder ({t1_vendor_name}) to close the ₹{abs(t1_vendor.get('effective_total', 0) - l1_vendor['effective_total']):,.2f} price gap.",
            "Do not issue Letter of Intent (LOI) until the Purchase Committee reviews the line-by-line Technical Spec Match discrepancies."
        ]
        recommended_vendor_id = t1_vendor.get("submission_id") if (t1_vendor and t1_vendor.get("compliance_percentage", 0) >= 90) else l1_vendor.get("submission_id")
    elif l1_dev > 0:
        headline = f"Advisory: Commercial L1 ({l1_vendor['vendor_name']}) has Minor Deviations"
        summary = (
            f"{l1_vendor['vendor_name']} is L1 among remaining qualified vendors at ₹{l1_vendor['effective_total']:,.2f} with {l1_dev} minor technical deviation(s). "
            f"Technical score is acceptable at {l1_tech_score}%."
            f"{dq_note}"
        )
        status = "L1_MINOR_DEVIATIONS"
        badge = "L1 Acceptable with Clarification"
        action_items = [
            f"Seek written confirmation from {l1_vendor['vendor_name']} regarding minor deviations before contract signing.",
            "Conduct pre-award negotiation to finalize warranty and AMC terms."
        ]
        recommended_vendor_id = l1_vendor.get("submission_id")
    else:
        headline = f"Optimal Award: {l1_vendor['vendor_name']} is Both L1 and Fully Compliant"
        summary = (
            f"{l1_vendor['vendor_name']} successfully achieves L1 commercial ranking (₹{l1_vendor['effective_total']:,.2f}) among remaining qualified vendors "
            f"and meets 100% of technical specifications with zero non-compliance."
            f"{dq_note}"
        )
        status = "RECOMMENDED_FOR_AWARD"
        badge = "Ready for Award"
        action_items = [
            f"Proceed to generate Draft Purchase Order for {l1_vendor['vendor_name']}.",
            "Initiate standard performance security deposit collection."
        ]
        recommended_vendor_id = l1_vendor.get("submission_id")

    return {
        "status": status,
        "headline": headline,
        "summary": summary,
        "badge": badge,
        "recommended_vendor_id": recommended_vendor_id,
        "action_items": action_items
    }


# -------------------------------------------------------------------------
# 6. COMPARATIVE STATEMENT LOGIC & L1/T1 EVALUATION
# -------------------------------------------------------------------------

async def get_comparative_statement_data(db: AsyncSession, boq_id: str) -> Dict[str, Any]:
    """
    Retrieves full side-by-side comparative statement matching Format_Comparative Statement.xlsx,
    assigning L1/L2/L3 commercial rankings and T1 technical ratings with deep discrepancy audits.
    """
    stmt = (
        select(BOQ)
        .options(
            selectinload(BOQ.items),
            selectinload(BOQ.submissions)
            .selectinload(BOQSubmission.vendor_organization),
            selectinload(BOQ.submissions)
            .selectinload(BOQSubmission.items)
        )
        .where(BOQ.id == boq_id)
    )
    res = await db.execute(stmt)
    boq = res.scalar_one_or_none()
    if not boq:
        raise ValueError(f"BOQ with id {boq_id} not found.")

    # Filter to submitted bids only
    active_submissions: List[BOQSubmission] = [
        s for s in boq.submissions 
        if s.status == "SUBMITTED" or s.submitted_at is not None
    ]

    # Check if any submission needs an AI technical audit
    needs_commit = False
    for sub in active_submissions:
        if sub.technical_score is None:
            try:
                await evaluate_submission_technical_compliance(boq, sub, db=None)
                needs_commit = True
            except Exception as audit_err:
                logger.warning(f"Could not auto-audit submission {sub.id}: {audit_err}")
    if needs_commit:
        try:
            await db.commit()
        except Exception as e:
            logger.warning(f"Failed to commit auto-audit: {e}")

    # Rank submissions for L1 (lowest effective grand total)
    def get_effective_total(sub: BOQSubmission) -> float:
        if sub.negotiated_grand_total is not None and sub.negotiated_grand_total > 0:
            return sub.negotiated_grand_total
        return sub.grand_total or 0.0

    sorted_by_price = sorted(
        [s for s in active_submissions if get_effective_total(s) > 0 and not getattr(s, "is_disqualified", False)],
        key=lambda s: get_effective_total(s)
    )

    l_rank_map = {}
    for rank_idx, sub in enumerate(sorted_by_price, start=1):
        l_rank_map[sub.id] = f"L{rank_idx}"

    # Determine T1 (Highest compliance score)
    def get_compliance_score(sub: BOQSubmission) -> float:
        if sub.technical_score is not None:
            return float(sub.technical_score)
        if not sub.items:
            return 0.0
        compliant_count = sum(1 for item in sub.items if item.technical_compliance == "COMPLIANT")
        return (compliant_count / len(sub.items)) * 100.0

    sorted_by_tech = sorted(
        [s for s in active_submissions if not getattr(s, "is_disqualified", False)],
        key=get_compliance_score, 
        reverse=True
    )
    t1_submission_id = sorted_by_tech[0].id if sorted_by_tech else None

    # Parse custom columns list
    custom_cols = []
    if boq.custom_columns_json:
        try:
            custom_cols = json.loads(boq.custom_columns_json)
        except Exception:
            custom_cols = []

    # Prepare vendor columns
    vendors_meta = []
    for s in active_submissions:
        org = s.vendor_organization
        eff_total = get_effective_total(s)
        tech_score = get_compliance_score(s)
        comp_count = sum(1 for item in s.items if item.technical_compliance == "COMPLIANT")
        dev_count = sum(1 for item in s.items if item.technical_compliance == "DEVIATION")
        non_comp_count = sum(1 for item in s.items if item.technical_compliance == "NON_COMPLIANT")

        v_id = org.id if org else (s.vendor_organization_id or s.id)
        v_name = org.legal_name if org else f"Vendor ({s.vendor_organization_id[:8] if s.vendor_organization_id else 'Unknown'})"
        company_name = (org.trade_name or org.legal_name) if org else v_name
        contact_no = (org.primary_phone or org.head_phone or "N/A") if org else "N/A"
        primary_email = (org.primary_email or org.head_email or "N/A") if org else "N/A"

        # Extract additional commercial fields from extracted_data_json if available
        ext_json = {}
        if s.extracted_data_json:
            try:
                ext_json = json.loads(s.extracted_data_json)
            except Exception:
                ext_json = {}
        c_terms = ext_json.get("commercial_terms", {}) or {}

        vendors_meta.append({
            "submission_id": s.id,
            "vendor_id": v_id,
            "vendor_name": v_name,
            "company_name": company_name,
            "contact_no": contact_no,
            "primary_email": primary_email,
            "model_no": s.model_no or ext_json.get("model_no") or "-",
            "tank_capacity_location": s.tank_capacity_location or ext_json.get("tank_capacity_location") or "-",
            "payment_terms": s.payment_terms or "Standard",
            "payment_terms_sitc": c_terms.get("payment_terms_sitc") or ext_json.get("payment_terms_sitc") or s.payment_terms or "100% Advance",
            "payment_terms_gas": c_terms.get("payment_terms_gas") or ext_json.get("payment_terms_gas") or "Within 30 days",
            "delivery_time": s.delivery_time or c_terms.get("delivery_time") or "8 to 10 Weeks",
            "warranty_terms": s.warranty_terms or c_terms.get("warranty_terms") or "Standard 1 Year",
            "agreement_tenure": c_terms.get("agreement_tenure") or ext_json.get("agreement_tenure") or "10 Years",
            "lock_in_period": c_terms.get("lock_in_period") or ext_json.get("lock_in_period") or "10 Years",
            "civil_work_scope": c_terms.get("civil_work_scope") or ext_json.get("civil_work_scope") or "Hospital Scope",
            "price_escalation": c_terms.get("price_escalation") or ext_json.get("price_escalation") or "Fixed for 2 years, 5% Y on Y Or Formula Based, whichever is lesser",
            "mode_of_delivery": c_terms.get("mode_of_delivery") or ext_json.get("mode_of_delivery") or "Weighment Basis",
            "minimum_expected_volume": c_terms.get("minimum_expected_volume") or ext_json.get("minimum_expected_volume") or "will review after 2 years 6 months",
            "sub_total": s.sub_total,
            "gst_percent": s.gst_percent,
            "gst_amount": s.gst_amount,
            "grand_total": s.grand_total,
            "negotiated_grand_total": s.negotiated_grand_total,
            "effective_total": eff_total,
            "l_rank": l_rank_map.get(s.id, "-"),
            "is_t1": (s.id == t1_submission_id),
            "compliance_percentage": round(tech_score, 1),
            "technical_score": round(tech_score, 1),
            "technical_notes": s.technical_notes,
            "compliant_count": comp_count,
            "deviation_count": dev_count,
            "non_compliant_count": non_comp_count,
            "total_items": len(s.items),
            "is_disqualified": bool(getattr(s, "is_disqualified", False)),
            "disqualification_note": getattr(s, "disqualification_note", None) or None,
        })

    # Prepare matrix rows: for each BOQItem, extract each vendor's quote and discrepancy
    rows = []
    for item_idx, boq_item in enumerate(boq.items, start=1):
        attrs = {}
        if boq_item.attributes_json:
            try:
                attrs = json.loads(boq_item.attributes_json)
            except Exception:
                attrs = {}

        vendor_quotes = {}
        lowest_item_price = float("inf")
        lowest_vendor_id = None

        for s in active_submissions:
            # Find submission item for this boq_item
            sub_item = next((si for si in s.items if si.boq_item_id == boq_item.id), None)
            if sub_item:
                unit_price = sub_item.quoted_unit_price
                neg_unit_price = sub_item.negotiated_unit_price
                tot_amount = sub_item.total_amount
                neg_tot = sub_item.negotiated_total_amount
                eff_price = neg_unit_price if (neg_unit_price is not None and neg_unit_price > 0) else unit_price

                if eff_price > 0 and eff_price < lowest_item_price:
                    lowest_item_price = eff_price
                    lowest_vendor_id = s.id

                disc = None
                if sub_item.attributes_json:
                    try:
                        disc = json.loads(sub_item.attributes_json)
                    except Exception:
                        disc = None

                vendor_quotes[s.id] = {
                    "submission_item_id": sub_item.id,
                    "model_no": sub_item.make_model_quoted or "-",
                    "initial_quoted_price": unit_price,
                    "negotiated_price": neg_unit_price,
                    "total_amount": tot_amount,
                    "negotiated_total_amount": neg_tot,
                    "technical_compliance": sub_item.technical_compliance,
                    "vendor_remarks": sub_item.vendor_remarks,
                    "discrepancy": disc
                }
            else:
                vendor_quotes[s.id] = {
                    "submission_item_id": None,
                    "model_no": "-",
                    "initial_quoted_price": 0.0,
                    "negotiated_price": None,
                    "total_amount": 0.0,
                    "negotiated_total_amount": None,
                    "technical_compliance": "NON_COMPLIANT",
                    "vendor_remarks": "-",
                    "discrepancy": {
                        "title": "Item Not Quoted",
                        "type": "MISSING_FEATURE",
                        "risk_level": "HIGH",
                        "explanation": "Vendor omitted this item from their submitted quote.",
                        "action_recommended": "Seek quote or mark non-responsive"
                    }
                }

        rows.append({
            "s_no": item_idx,
            "boq_item_id": boq_item.id,
            "item_code": boq_item.item_code or str(item_idx),
            "item_name": boq_item.item_name,
            "specifications": boq_item.specifications or "",
            "quantity": boq_item.quantity,
            "uom": boq_item.uom,
            "attributes": attrs,
            "lowest_price": lowest_item_price if lowest_item_price != float("inf") else 0.0,
            "lowest_submission_id": lowest_vendor_id,
            "vendor_quotes": vendor_quotes
        })

    # Cost Analytics
    # Filter out disqualified for statistical baseline and QCBS
    qualified_vendors = [v for v in vendors_meta if not v.get("is_disqualified")]
    
    all_eff_totals = [v["effective_total"] for v in qualified_vendors if v["effective_total"] > 0]
    lowest_grand_total = min(all_eff_totals) if all_eff_totals else 0.0
    highest_grand_total = max(all_eff_totals) if all_eff_totals else 0.0
    price_spread = highest_grand_total - lowest_grand_total
    sorted_totals = sorted(all_eff_totals)
    potential_savings = (sorted_totals[1] - lowest_grand_total) if len(sorted_totals) > 1 else 0.0

    # Item price statistics
    item_stats = {}
    for r in rows:
        prices = [
            q["initial_quoted_price"] 
            for v in qualified_vendors
            for sid, q in r["vendor_quotes"].items()
            if sid == v["submission_id"] and q["initial_quoted_price"] > 0
        ]
        if prices:
            min_p = min(prices)
            max_p = max(prices)
            avg_p = sum(prices) / len(prices)
            spread_p = max_p - min_p
            var_pct = ((max_p - min_p) / min_p * 100.0) if min_p > 0 else 0.0
            item_stats[r["boq_item_id"]] = {
                "min_price": min_p,
                "max_price": max_p,
                "avg_price": round(avg_p, 2),
                "spread": spread_p,
                "variance_pct": round(var_pct, 1)
            }

    # QCBS Composite Scoring (70% Commercial + 30% Technical)
    qcbs_rankings = []
    for v in qualified_vendors:
        v_eff = v["effective_total"]
        comm_score = (lowest_grand_total / v_eff * 70.0) if (v_eff > 0 and lowest_grand_total > 0) else 0.0
        tech_score = v["compliance_percentage"] or 0.0
        tech_weighted = tech_score * 0.30
        qcbs_composite = round(comm_score + tech_weighted, 2)
        qcbs_rankings.append({
            "submission_id": v["submission_id"],
            "vendor_name": v["vendor_name"],
            "l_rank": v["l_rank"],
            "effective_total": v_eff,
            "commercial_score": round(comm_score, 2),
            "technical_score": round(tech_score, 1),
            "technical_weighted": round(tech_weighted, 2),
            "qcbs_composite_score": qcbs_composite
        })
    qcbs_rankings.sort(key=lambda x: x["qcbs_composite_score"], reverse=True)

    # Strategic Advisory
    l1_vendor = next((v for v in vendors_meta if v["l_rank"] == "L1"), None)
    t1_vendor = next((v for v in vendors_meta if v["is_t1"]), None)
    dq_vendors = [v for v in vendors_meta if v.get("is_disqualified")]
    advisory = _generate_strategic_advisory(l1_vendor, t1_vendor, qcbs_rankings, rows, dq_vendors)

    return {
        "boq_id": boq.id,
        "tender_number": boq.tender_number or f"JECRC-BOQ-{boq.id[:8].upper()}",
        "title": boq.title,
        "department": boq.department,
        "boq_type": getattr(boq, "boq_type", "COMMERCIAL") or "COMMERCIAL",
        "status": boq.status,
        "deadline_at": boq.deadline_at.isoformat() if boq.deadline_at else None,
        "is_locked": (boq.status in ["LOCKED", "EVALUATED", "AWARDED"]) or (
            bool(boq.deadline_at) and datetime.now(timezone.utc) > (
                boq.deadline_at if boq.deadline_at.tzinfo else boq.deadline_at.replace(tzinfo=timezone.utc)
            )
        ),
        "custom_columns": custom_cols,
        "vendors": vendors_meta,
        "rows": rows,
        "cost_analytics": {
            "lowest_grand_total": lowest_grand_total,
            "highest_grand_total": highest_grand_total,
            "price_spread": price_spread,
            "potential_savings": potential_savings,
            "item_stats": item_stats
        },
        "l1_profile": l1_vendor,
        "t1_profile": t1_vendor,
        "qcbs_rankings": qcbs_rankings,
        "advisory": advisory
    }


# -------------------------------------------------------------------------
# 7. VENDOR SUBMISSION DETAILED VIEW DATA
# -------------------------------------------------------------------------

async def get_submission_detail_data(db: AsyncSession, boq_id: str, submission_id: str) -> Dict[str, Any]:
    """
    Fetches full standalone vendor submission details for modal inspection.
    """
    stmt = (
        select(BOQSubmission)
        .options(
            selectinload(BOQSubmission.vendor_organization),
            selectinload(BOQSubmission.items).selectinload(BOQSubmissionItem.boq_item),
            selectinload(BOQSubmission.boq).selectinload(BOQ.items)
        )
        .where(BOQSubmission.id == submission_id, BOQSubmission.boq_id == boq_id)
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise ValueError("Submission not found.")
    
    org = sub.vendor_organization
    boq = sub.boq

    items_detail = []
    for si in sub.items:
        bi = si.boq_item
        disc = None
        if si.attributes_json:
            try:
                disc = json.loads(si.attributes_json)
            except Exception:
                disc = None
        
        items_detail.append({
            "submission_item_id": si.id,
            "boq_item_id": bi.id if bi else None,
            "item_code": bi.item_code if bi else "",
            "item_name": bi.item_name if bi else "Item",
            "specifications": bi.specifications if bi else "",
            "quantity": bi.quantity if bi else 1.0,
            "uom": bi.uom if bi else "Nos",
            "quoted_unit_price": si.quoted_unit_price,
            "negotiated_unit_price": si.negotiated_unit_price,
            "total_amount": si.total_amount,
            "negotiated_total_amount": si.negotiated_total_amount,
            "gst_percent": getattr(si, 'gst_percent', 18.0),
            "gst_amount": getattr(si, 'gst_amount', 0.0),
            "make_model_quoted": si.make_model_quoted,
            "technical_compliance": si.technical_compliance,
            "vendor_remarks": si.vendor_remarks,
            "discrepancy": disc
        })

    comp_count = sum(1 for it in sub.items if it.technical_compliance == "COMPLIANT")
    dev_count = sum(1 for it in sub.items if it.technical_compliance == "DEVIATION")
    non_comp_count = sum(1 for it in sub.items if it.technical_compliance == "NON_COMPLIANT")

    return {
        "submission_id": sub.id,
        "boq_id": boq.id,
        "tender_number": boq.tender_number,
        "tender_title": boq.title,
        "status": sub.status,
        "submission_type": sub.submission_type,
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        "vendor": {
            "id": org.id if org else (sub.vendor_organization_id or sub.id),
            "legal_name": org.legal_name if org else "Unknown Vendor",
            "trade_name": org.trade_name if org else "Unknown Vendor",
            "pan": getattr(org, "pan_number", None) if org else None,
            "gstin": org.gstin if org else "N/A",
            "primary_email": (org.primary_email or org.head_email) if org else None,
            "primary_phone": (org.primary_phone or org.head_phone) if org else None,
            "address": f"{org.city or ''}, {org.state_province or ''}, {org.country or ''}".strip(", ") if org else "N/A"
        },
        "commercials": {
            "sub_total": sub.sub_total,
            "gst_percent": sub.gst_percent,
            "gst_amount": sub.gst_amount,
            "grand_total": sub.grand_total,
            "negotiated_grand_total": sub.negotiated_grand_total,
            "payment_terms": sub.payment_terms or "Standard",
            "delivery_time": sub.delivery_time or "Standard",
            "warranty_terms": sub.warranty_terms or "Standard 1 Year"
        },
        "audit": {
            "technical_score": sub.technical_score,
            "technical_notes": sub.technical_notes,
            "compliant_count": comp_count,
            "deviation_count": dev_count,
            "non_compliant_count": non_comp_count,
            "total_items": len(sub.items)
        },
        "items": items_detail
    }


def export_comparative_statement_excel(comp_data: Dict[str, Any]) -> io.BytesIO:
    """
    Builds a styled Excel spreadsheet mirroring Format_Comparative Statement.xlsx.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Comparative Statement"
    ws.views.sheetView[0].showGridLines = True

    # Palette
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    dark_gray_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    l1_gold_fill = PatternFill(start_color="FEF08A", end_color="FEF08A", fill_type="solid")
    summary_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    white_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    white_bold_11 = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    bold_data = Font(name="Calibri", size=10, bold=True, color="0F172A")
    l1_font = Font(name="Calibri", size=10, bold=True, color="854D0E")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    thick_bottom = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='medium', color='1E3A8A')
    )

    vendors = comp_data.get("vendors", [])
    rows = comp_data.get("rows", [])
    num_vendors = len(vendors)

    # Title Banner (Row 2)
    tender_title = comp_data.get("title", "")
    dept = comp_data.get("department", "Procurement")
    ws["A2"] = f"Comparative Statement of {tender_title} ({dept}) at JECRC Medical College & Hospital"
    ws["A2"].font = title_font

    # Base columns: S no., Particulars, UOM, Qty
    base_cols = ["S no.", "Particulars", "UOM", "Qty"]
    num_base = len(base_cols)

    # Set up Vendor Header Columns starting from column E (col 5)
    # Each vendor gets 3 sub-columns: Initial Quoted Price (INR), Negotiated Price (INR), Total Amount (INR)
    current_col = num_base + 1
    for idx, v in enumerate(vendors, start=1):
        v_start = current_col
        v_end = current_col + 2
        
        # Merge vendor label across 3 columns
        # Row 3: Vendor 1 (L1/L2), Row 4: Vendor Name, Row 5: Contact No, Row 6: Model No, Row 7: Tank Capacity & Location
        ws.merge_cells(start_row=3, start_column=v_start, end_row=3, end_column=v_end)
        is_dq = v.get("is_disqualified", False)
        dq_note = v.get("disqualification_note") or ""
        rank_label = "DISQUALIFIED" if is_dq else v.get('l_rank', '')
        cell_v = ws.cell(row=3, column=v_start, value=f"Vendor {idx} ({rank_label}){' — ' + dq_note if is_dq and dq_note else ''}")
        if is_dq:
            cell_v.fill = PatternFill(start_color="7F1D1D", end_color="7F1D1D", fill_type="solid")
            cell_v.font = Font(name="Calibri", size=10, bold=True, color="FCA5A5")
        else:
            cell_v.font = white_bold_11
            cell_v.fill = navy_fill if v.get("l_rank") != "L1" else l1_gold_fill
            if v.get("l_rank") == "L1":
                cell_v.font = l1_font
        cell_v.alignment = Alignment(horizontal="center", vertical="center")


        ws.merge_cells(start_row=4, start_column=v_start, end_row=4, end_column=v_end)
        c4 = ws.cell(row=4, column=v_start, value=v.get('vendor_name') or v.get('company_name') or f"Vendor {idx}")
        c4.font = bold_data
        c4.alignment = Alignment(horizontal="center", vertical="center")

        ws.merge_cells(start_row=5, start_column=v_start, end_row=5, end_column=v_end)
        c5 = ws.cell(row=5, column=v_start, value=v.get('contact_no') or "-")
        c5.font = data_font
        c5.alignment = Alignment(horizontal="center", vertical="center")

        ws.merge_cells(start_row=6, start_column=v_start, end_row=6, end_column=v_end)
        c6 = ws.cell(row=6, column=v_start, value=v.get('model_no') or "-")
        c6.font = data_font
        c6.alignment = Alignment(horizontal="center", vertical="center")

        ws.merge_cells(start_row=7, start_column=v_start, end_row=7, end_column=v_end)
        c7 = ws.cell(row=7, column=v_start, value=v.get('tank_capacity_location') or "-")
        c7.font = data_font
        c7.alignment = Alignment(horizontal="center", vertical="center")

        # Row 8 sub-headers
        h1 = ws.cell(row=8, column=v_start, value="Initial Quoted Price (INR)")
        h2 = ws.cell(row=8, column=v_start + 1, value="Negotiated Price (INR)")
        h3 = ws.cell(row=8, column=v_start + 2, value="Total Amount (INR)")
        for h in [h1, h2, h3]:
            h.font = white_font
            h.fill = dark_gray_fill
            h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        current_col += 3

    # Row 4-7 Labels in Column B
    ws["B4"] = "Vendor Name"
    ws["B4"].font = bold_data
    ws["B5"] = "Contact No."
    ws["B5"].font = bold_data
    ws["B6"] = "Model No."
    ws["B6"].font = bold_data
    ws["B7"] = "Tank Capacity & Location"
    ws["B7"].font = bold_data

    # Row 8 Base headers
    for idx, b_name in enumerate(base_cols, start=1):
        cell = ws.cell(row=8, column=idx, value=b_name)
        cell.font = white_font
        cell.fill = navy_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    ws.row_dimensions[8].height = 28

    # Populate Data Rows (Starting Row 9)
    current_row = 9
    first_item_row = current_row
    for r in rows:
        ws.cell(row=current_row, column=1, value=r["s_no"]).alignment = Alignment(horizontal="center")
        ws.cell(row=current_row, column=2, value=r["item_name"])
        ws.cell(row=current_row, column=3, value=r["uom"]).alignment = Alignment(horizontal="center")
        ws.cell(row=current_row, column=4, value=r["quantity"]).alignment = Alignment(horizontal="center")

        v_col = num_base + 1
        for v in vendors:
            sub_id = v["submission_id"]
            quote = r["vendor_quotes"].get(sub_id, {})
            
            c_init = ws.cell(row=current_row, column=v_col, value=quote.get("initial_quoted_price", 0.0))
            c_init.number_format = "#,##0.00"
            c_neg = ws.cell(row=current_row, column=v_col + 1, value=quote.get("negotiated_price") or 0.0)
            c_neg.number_format = "#,##0.00"
            
            # Use Excel formula if quantity > 0: =D{row} * H{row} or negotiated price
            qty_col_letter = get_column_letter(4)
            price_col_letter = get_column_letter(v_col + 1 if (quote.get("negotiated_price") or 0.0) > 0 else v_col)
            c_tot = ws.cell(row=current_row, column=v_col + 2, value=f"={qty_col_letter}{current_row}*{price_col_letter}{current_row}")
            c_tot.number_format = "#,##0.00"
            c_tot.font = bold_data

            v_col += 3

        for c in range(1, num_base + (num_vendors * 3) + 1):
            ws.cell(row=current_row, column=c).border = thin_border
            ws.cell(row=current_row, column=c).font = data_font

        current_row += 1

    last_item_row = current_row - 1

    # Blank separator row
    current_row += 1

    # Summary Section (Sub Total, GST, Grand Total, and Commercial Terms Matrix)
    # Row: Sub Total (INR) with Excel =SUM(...) formulas
    ws.cell(row=current_row, column=2, value="Sub Total (INR)").font = bold_data
    ws.cell(row=current_row, column=2).fill = summary_fill
    v_col = num_base + 1
    for v in vendors:
        tot_col_letter = get_column_letter(v_col + 2)
        ws.merge_cells(start_row=current_row, start_column=v_col, end_row=current_row, end_column=v_col + 2)
        c = ws.cell(row=current_row, column=v_col, value=f"=SUM({tot_col_letter}{first_item_row}:{tot_col_letter}{last_item_row})")
        c.font = bold_data
        c.number_format = "#,##0.00"
        c.alignment = Alignment(horizontal="right", vertical="center")
        v_col += 3
    for col_idx in range(1, num_base + (num_vendors * 3) + 1):
        ws.cell(row=current_row, column=col_idx).border = thin_border
    subtotal_row = current_row
    current_row += 1

    # Row: GST Extra
    ws.cell(row=current_row, column=2, value="Total GST (As per Line Items)").font = bold_data
    ws.cell(row=current_row, column=2).fill = summary_fill
    v_col = num_base + 1
    for v in vendors:
        ws.merge_cells(start_row=current_row, start_column=v_col, end_row=current_row, end_column=v_col + 2)
        gst_amt = v.get("gst_amount", 0.0)
        c = ws.cell(row=current_row, column=v_col, value=gst_amt)
        c.font = bold_data
        c.number_format = "#,##0.00"
        c.alignment = Alignment(horizontal="right", vertical="center")
        v_col += 3
    for col_idx in range(1, num_base + (num_vendors * 3) + 1):
        ws.cell(row=current_row, column=col_idx).border = thin_border
    gst_row = current_row
    current_row += 1

    # Row: Grand Total (INR)
    ws.cell(row=current_row, column=2, value="Grand Total (INR)").font = white_bold_11
    ws.cell(row=current_row, column=2).fill = navy_fill
    v_col = num_base + 1
    for v in vendors:
        ws.merge_cells(start_row=current_row, start_column=v_col, end_row=current_row, end_column=v_col + 2)
        sub_col_letter = get_column_letter(v_col)
        c = ws.cell(row=current_row, column=v_col, value=f"={sub_col_letter}{subtotal_row}+{sub_col_letter}{gst_row}")
        c.font = bold_data if v.get("l_rank") != "L1" else l1_font
        if v.get("l_rank") == "L1":
            c.fill = l1_gold_fill
        c.number_format = "#,##0.00"
        c.alignment = Alignment(horizontal="right", vertical="center")
        v_col += 3
    for col_idx in range(1, num_base + (num_vendors * 3) + 1):
        ws.cell(row=current_row, column=col_idx).border = thin_border
    current_row += 1

    # Commercial Terms Comparison Matrix (Mirroring Comparative Statement of LMO.xlsx)
    commercial_clause_items = [
        ("Payment Terms (for SITC)", lambda v: v.get("payment_terms_sitc") or v.get("payment_terms") or "100% Advance"),
        ("Payment Terms (for Medical Gases / Consumables)", lambda v: v.get("payment_terms_gas") or "Within 30 days"),
        ("Delivery Time & Completion", lambda v: v.get("delivery_time") or "8 Weeks to 10 Weeks"),
        ("Minimum Agreement Tenure", lambda v: v.get("agreement_tenure") or "10 Years"),
        ("Agreement Lock in period", lambda v: v.get("lock_in_period") or "10 Years"),
        ("Complete Civil work", lambda v: v.get("civil_work_scope") or "Hospital Scope"),
        ("Price Escalation", lambda v: v.get("price_escalation") or "Fixed for 2 years, 5% Y on Y Or Formula Based, whichever is lesser"),
        ("Mode of Delivery", lambda v: v.get("mode_of_delivery") or "Weighment Basis"),
        ("Minimum Expected Volume", lambda v: v.get("minimum_expected_volume") or "will review after 2 years 6 months"),
        ("Technical Rating", lambda v: v.get("t_rank") or "T-1"),
        ("Commercial Rating", lambda v: v.get("l_rank") or "L-1")
    ]

    for label, val_func in commercial_clause_items:
        ws.cell(row=current_row, column=2, value=label).font = bold_data
        ws.cell(row=current_row, column=2).fill = summary_fill

        v_col = num_base + 1
        for v in vendors:
            val = val_func(v)
            ws.merge_cells(start_row=current_row, start_column=v_col, end_row=current_row, end_column=v_col + 2)
            c = ws.cell(row=current_row, column=v_col, value=val)
            c.font = bold_data
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            if label == "Commercial Rating" and v.get("l_rank") == "L1":
                c.fill = l1_gold_fill
                c.font = l1_font
            v_col += 3

        for col_idx in range(1, num_base + (num_vendors * 3) + 1):
            ws.cell(row=current_row, column=col_idx).border = thin_border

        current_row += 1

    # Signature Block (Rows 49 and 56 matching LMO excel)
    current_row = max(current_row + 3, 49)
    ws.cell(row=current_row, column=2, value="Prepared by").font = bold_data
    ws.cell(row=current_row, column=6, value="Technical User / Head").font = bold_data
    current_row += 7
    ws.cell(row=current_row, column=2, value="Chief Executive Officer").font = bold_data

    # Set column widths
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 38
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    for col_i in range(5, num_base + (num_vendors * 3) + 1):
        col_letter = get_column_letter(col_i)
        ws.column_dimensions[col_letter].width = 20

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def export_comparative_statement_pdf(comp_data: Dict[str, Any]) -> io.BytesIO:
    """
    Builds a professional PDF comparative statement using ReportLab.
    A4 landscape layout with full vendor comparison table, L1/T1 rankings,
    disqualification notes, totals, and signature block.
    """
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm, cm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph,
        Spacer, HRFlowable, KeepTogether
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    buffer = io.BytesIO()
    page_size = landscape(A3)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        title="Comparative Statement"
    )

    styles = getSampleStyleSheet()
    # Custom styles
    title_style = ParagraphStyle("Title", parent=styles["Normal"],
        fontSize=14, fontName="Helvetica-Bold", textColor=colors.HexColor("#1E3A8A"),
        spaceAfter=4, alignment=TA_LEFT)
    subtitle_style = ParagraphStyle("Sub", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica", textColor=colors.HexColor("#64748B"),
        spaceAfter=2)
    heading_style = ParagraphStyle("Heading", parent=styles["Normal"],
        fontSize=10, fontName="Helvetica-Bold", textColor=colors.HexColor("#0F172A"))
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"],
        fontSize=7.5, fontName="Helvetica", textColor=colors.HexColor("#1E293B"), leading=10)
    cell_bold = ParagraphStyle("CellBold", parent=styles["Normal"],
        fontSize=7.5, fontName="Helvetica-Bold", textColor=colors.HexColor("#0F172A"), leading=10)
    cell_center = ParagraphStyle("CellC", parent=styles["Normal"],
        fontSize=7.5, fontName="Helvetica", textColor=colors.HexColor("#1E293B"), alignment=TA_CENTER, leading=10)
    dq_style = ParagraphStyle("DQ", parent=styles["Normal"],
        fontSize=7, fontName="Helvetica-Bold", textColor=colors.HexColor("#DC2626"),
        alignment=TA_CENTER, leading=9)

    vendors = comp_data.get("vendors", [])
    rows = comp_data.get("rows", [])
    tender_number = comp_data.get("tender_number", "")
    tender_title = comp_data.get("title", "")
    dept = comp_data.get("department", "Procurement")
    boq_type = comp_data.get("boq_type", "COMMERCIAL")

    # Color palette
    navy = colors.HexColor("#1E3A8A")
    dark_slate = colors.HexColor("#1E293B")
    gold = colors.HexColor("#D97706")
    gold_light = colors.HexColor("#FEF3C7")
    dq_red = colors.HexColor("#7F1D1D")
    dq_red_light = colors.HexColor("#FEE2E2")
    slate_100 = colors.HexColor("#F1F5F9")
    slate_200 = colors.HexColor("#E2E8F0")
    white = colors.white
    emerald = colors.HexColor("#059669")
    amber_light = colors.HexColor("#FFF3CD")

    story = []

    # ---- Header ----
    story.append(Paragraph("JECRC Medical College &amp; Hospital", ParagraphStyle("Org", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica", textColor=colors.HexColor("#64748B"))))
    story.append(Paragraph(f"Comparative Statement of Quotations — {tender_title}", title_style))
    story.append(Paragraph(
        f"Tender No: {tender_number} &nbsp;&nbsp;|&nbsp;&nbsp; Department: {dept} &nbsp;&nbsp;|&nbsp;&nbsp; Type: {boq_type} BOQ",
        subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=navy, spaceAfter=8))

    # ---- Vendor Summary Cards (Header Row Table) ----
    num_v = len(vendors)
    vendor_header_data = [[
        Paragraph("Vendor", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                           textColor=white, alignment=TA_CENTER)),
        Paragraph("L-Rank", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                           textColor=white, alignment=TA_CENTER)),
        Paragraph("Company Name", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                                  textColor=white, alignment=TA_CENTER)),
        Paragraph("Contact", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                             textColor=white, alignment=TA_CENTER)),
        Paragraph("Grand Total (Rs.)", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                                      textColor=white, alignment=TA_CENTER)),
        Paragraph("GST %", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                           textColor=white, alignment=TA_CENTER)),
        Paragraph("Status", ParagraphStyle("VH", parent=styles["Normal"], fontSize=7.5, fontName="Helvetica-Bold",
                                            textColor=white, alignment=TA_CENTER)),
    ]]

    vendor_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, slate_100]),
        ("GRID", (0, 0), (-1, -1), 0.4, slate_200),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    for i, v in enumerate(vendors, start=1):
        is_dq = v.get("is_disqualified", False)
        is_l1 = v.get("l_rank") == "L1"
        grand_total = v.get("negotiated_grand_total") or v.get("grand_total") or 0

        txt_color = colors.HexColor("#DC2626") if is_dq else (gold if is_l1 else dark_slate)
        row = [
            Paragraph(f"V{i}", cell_center),
            Paragraph(v.get("l_rank", "-"), ParagraphStyle("Rank", parent=styles["Normal"],
                fontSize=8, fontName="Helvetica-Bold", textColor=txt_color, alignment=TA_CENTER)),
            Paragraph(v.get("vendor_name", "-"), cell_style),
            Paragraph(v.get("contact_no", "-"), cell_style),
            Paragraph(f"Rs. {grand_total:,.2f}", ParagraphStyle("Amt", parent=styles["Normal"],
                fontSize=8, fontName="Helvetica-Bold", textColor=txt_color, alignment=TA_RIGHT)),
            Paragraph(f"{v.get('gst_percent', 18):.0f}%", cell_center),
            Paragraph("⛔ DISQUALIFIED" if is_dq else ("✅ L1 WINNER" if is_l1 else "Active"), dq_style if is_dq else cell_center),
        ]
        vendor_header_data.append(row)
        row_idx = i  # 1-indexed body row

        if is_dq:
            vendor_styles.extend([
                ("BACKGROUND", (0, row_idx), (-1, row_idx), dq_red_light),
                ("TEXTCOLOR", (0, row_idx), (-1, row_idx), colors.HexColor("#DC2626")),
            ])
        elif is_l1:
            vendor_styles.extend([
                ("BACKGROUND", (0, row_idx), (-1, row_idx), gold_light),
            ])

    avail_width = page_size[0] - 3*cm
    vh_table = Table(vendor_header_data, colWidths=[
        avail_width * 0.05, avail_width * 0.07, avail_width * 0.24,
        avail_width * 0.15, avail_width * 0.18, avail_width * 0.07, avail_width * 0.14
    ])
    vh_table.setStyle(TableStyle(vendor_styles))
    story.append(vh_table)
    story.append(Spacer(1, 8))

    # ---- Disqualification Notes Section ----
    dq_vendors = [v for v in vendors if v.get("is_disqualified")]
    if dq_vendors:
        dq_data = [[
            Paragraph("Disqualified Vendors — Reason Log", ParagraphStyle("DQHDR", parent=styles["Normal"],
                fontSize=9, fontName="Helvetica-Bold", textColor=white))
        ]]
        for v in dq_vendors:
            dq_data.append([Paragraph(
                f"<b>⛔ {v.get('vendor_name')}</b> — {v.get('disqualification_note') or 'No reason provided'}",
                ParagraphStyle("DQNote", parent=styles["Normal"], fontSize=7.5,
                    textColor=colors.HexColor("#991B1B"), leading=11)
            )])
        dq_table = Table(dq_data, colWidths=[avail_width])
        dq_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), dq_red),
            ("BACKGROUND", (0, 1), (-1, -1), dq_red_light),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#FECACA")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(dq_table)
        story.append(Spacer(1, 8))

    # ---- Comparative Price Matrix ----
    story.append(Paragraph("Comparative Price Matrix", ParagraphStyle("MatHdr", parent=styles["Normal"],
        fontSize=11, fontName="Helvetica-Bold", textColor=navy, spaceAfter=4)))

    # Build header row: S.No | Item | UOM | Qty | [V1 Quoted | V1 Neg | V1 Total] x N
    matrix_header = [
        Paragraph("#", cell_bold),
        Paragraph("Item / Description", cell_bold),
        Paragraph("UOM", cell_center),
        Paragraph("Qty", cell_center),
    ]
    for i, v in enumerate(vendors, start=1):
        is_dq = v.get("is_disqualified", False)
        col_color = colors.HexColor("#DC2626") if is_dq else (gold if v.get("l_rank") == "L1" else white)
        matrix_header.append(Paragraph(f"V{i} Quoted (Rs.)", ParagraphStyle("MH", parent=styles["Normal"],
            fontSize=6.5, fontName="Helvetica-Bold", textColor=col_color, alignment=TA_CENTER)))
        matrix_header.append(Paragraph(f"V{i} Neg (Rs.)", ParagraphStyle("MH", parent=styles["Normal"],
            fontSize=6.5, fontName="Helvetica-Bold", textColor=col_color, alignment=TA_CENTER)))
        matrix_header.append(Paragraph(f"V{i} Total (Rs.)", ParagraphStyle("MH", parent=styles["Normal"],
            fontSize=6.5, fontName="Helvetica-Bold", textColor=col_color, alignment=TA_CENTER)))

    matrix_data = [matrix_header]
    matrix_styles_list = [
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, slate_100]),
        ("GRID", (0, 0), (-1, -1), 0.3, slate_200),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]

    # Highlight L1 vendor columns with gold tint
    for i, v in enumerate(vendors):
        col_start = 4 + i * 3
        col_end = col_start + 2
        if v.get("l_rank") == "L1":
            matrix_styles_list.append(("BACKGROUND", (col_start, 0), (col_end, 0), gold))
        elif v.get("is_disqualified"):
            matrix_styles_list.append(("BACKGROUND", (col_start, 0), (col_end, 0), dq_red))

    for row in rows:
        data_row = [
            Paragraph(str(row.get("s_no", "")), cell_center),
            Paragraph(f"<b>{row.get('item_name', '')}</b><br/><font size='6'>{row.get('specifications', '')[:80]}</font>", cell_style),
            Paragraph(row.get("uom", ""), cell_center),
            Paragraph(str(row.get("quantity", "")), cell_center),
        ]
        for v in vendors:
            q = row.get("vendor_quotes", {}).get(v.get("submission_id", ""), {})
            quoted = q.get("initial_quoted_price", 0) or 0
            neg = q.get("negotiated_price") or 0
            total = q.get("total_amount", 0) or 0
            is_dq = v.get("is_disqualified", False)
            num_style = ParagraphStyle("Num", parent=styles["Normal"],
                fontSize=7, fontName="Helvetica",
                textColor=colors.HexColor("#9CA3AF") if is_dq else dark_slate,
                alignment=TA_RIGHT)
            data_row.extend([
                Paragraph(f"Rs. {quoted:,.2f}", num_style),
                Paragraph(f"Rs. {neg:,.2f}" if neg else "-", num_style),
                Paragraph(f"Rs. {total:,.2f}", num_style),
            ])
        matrix_data.append(data_row)

    # Totals row
    totals_row = [
        Paragraph("", cell_bold),
        Paragraph("GRAND TOTAL (incl. GST)", ParagraphStyle("TotLbl", parent=styles["Normal"],
            fontSize=8, fontName="Helvetica-Bold", textColor=navy)),
        Paragraph("", cell_bold),
        Paragraph("", cell_bold),
    ]
    for v in vendors:
        is_dq = v.get("is_disqualified", False)
        eff = v.get("negotiated_grand_total") or v.get("grand_total") or 0
        tot_color = colors.HexColor("#DC2626") if is_dq else (gold if v.get("l_rank") == "L1" else navy)
        totals_row.extend([
            Paragraph("", cell_bold),
            Paragraph("", cell_bold),
            Paragraph(f"Rs. {eff:,.2f}", ParagraphStyle("Tot", parent=styles["Normal"],
                fontSize=8, fontName="Helvetica-Bold", textColor=tot_color, alignment=TA_RIGHT)),
        ])
    matrix_data.append(totals_row)

    total_row_idx = len(matrix_data) - 1
    matrix_styles_list.extend([
        ("BACKGROUND", (0, total_row_idx), (-1, total_row_idx), dark_slate),
        ("TEXTCOLOR", (0, total_row_idx), (-1, total_row_idx), white),
        ("FONTNAME", (0, total_row_idx), (-1, total_row_idx), "Helvetica-Bold"),
        ("LINEABOVE", (0, total_row_idx), (-1, total_row_idx), 1.5, navy),
    ])

    # Column widths for matrix
    base_widths = [avail_width * 0.03, avail_width * 0.18, avail_width * 0.05, avail_width * 0.04]
    remaining = avail_width - sum(base_widths)
    per_vendor = remaining / num_v if num_v else remaining
    vendor_col_widths = [per_vendor / 3] * 3 * num_v
    matrix_col_widths = base_widths + vendor_col_widths

    matrix_table = Table(matrix_data, colWidths=matrix_col_widths, repeatRows=1)
    matrix_table.setStyle(TableStyle(matrix_styles_list))
    story.append(matrix_table)
    story.append(Spacer(1, 12))

    # ---- Signature Block ----
    sig_data = [[
        Paragraph("Prepared by:", cell_style),
        Paragraph("Reviewed by (Technical Head):", cell_style),
        Paragraph("Approved by (CEO):", cell_style),
    ], [
        Paragraph("\n\n\n_______________________", cell_style),
        Paragraph("\n\n\n_______________________", cell_style),
        Paragraph("\n\n\n_______________________", cell_style),
    ]]
    sig_table = Table(sig_data, colWidths=[avail_width / 3] * 3)
    sig_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0, white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
