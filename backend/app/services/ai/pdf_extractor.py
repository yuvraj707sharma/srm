"""
PDF text extraction utilities.

Reads document bytes (already fetched from StorageService) and extracts
page-by-page text using PyMuPDF (fitz).

Security notes:
  - The caller must fetch bytes via the StorageService abstraction.
  - Filesystem paths are NEVER accepted here; we operate only on bytes.
  - Input size is checked before importing into PyMuPDF.
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────
MAX_BYTES = 50 * 1024 * 1024          # 50 MB hard cap before PDF parsing
PAGE_SEPARATOR = "\n\n--- PAGE {page} ---\n\n"


@dataclass
class ExtractionOutput:
    text: str
    page_count: int
    truncated: bool           # True if content was cut at GEMINI_MAX_INPUT_CHARS
    is_empty: bool            # True if no text was found at all
    warning: str | None       # Human-readable limitation note (image-only, etc.)


class PDFExtractionError(Exception):
    """Raised when the document bytes cannot be parsed as a PDF."""


def extract_text_from_pdf(
    pdf_bytes: bytes,
    max_output_chars: int,
) -> ExtractionOutput:
    """
    Synchronous PDF text extraction.  Run via asyncio.run_in_executor() in
    async contexts so the event loop is not blocked.

    Args:
        pdf_bytes:        Raw bytes of the document.
        max_output_chars: Maximum characters to include in the returned text.
                          Content beyond this limit is silently dropped and
                          truncated=True is set on the result.

    Returns:
        ExtractionOutput

    Raises:
        PDFExtractionError  – on corrupt/invalid input or size violations.
    """
    import fitz  # PyMuPDF — imported lazily so the module can be mocked in tests

    if len(pdf_bytes) == 0:
        raise PDFExtractionError("Document is empty (0 bytes).")

    if len(pdf_bytes) > MAX_BYTES:
        raise PDFExtractionError(
            f"Document exceeds maximum allowed size of {MAX_BYTES // (1024 * 1024)} MB."
        )

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")  # type: ignore[attr-defined]
    except Exception as exc:
        raise PDFExtractionError(f"Could not open document as PDF: {exc}") from exc

    if doc.page_count == 0:
        doc.close()
        raise PDFExtractionError("PDF has no pages.")

    page_count = doc.page_count
    parts: list[str] = []
    total_chars = 0
    truncated = False
    image_only_pages = 0

    for page_num in range(page_count):
        page = doc.load_page(page_num)
        page_text = page.get_text("text")  # type: ignore[attr-defined]

        if not page_text.strip():
            image_only_pages += 1
            continue

        header = PAGE_SEPARATOR.format(page=page_num + 1)
        chunk = header + page_text

        if total_chars + len(chunk) > max_output_chars:
            # Take only what fits
            remaining = max_output_chars - total_chars
            if remaining > 0:
                parts.append(chunk[:remaining])
            truncated = True
            logger.warning(
                "PDF text truncated at %d chars (page %d of %d).",
                max_output_chars,
                page_num + 1,
                page_count,
            )
            break

        parts.append(chunk)
        total_chars += len(chunk)

    doc.close()

    full_text = "".join(parts).strip()
    is_empty = not full_text

    warning: str | None = None
    if image_only_pages == page_count:
        warning = (
            "This document appears to be image-only. "
            "No machine-readable text was found. "
            "OCR is not yet implemented; extraction may be empty."
        )
    elif image_only_pages > 0:
        warning = (
            f"{image_only_pages}/{page_count} pages contained no machine-readable text "
            "(possible scanned images). Those pages were skipped."
        )

    return ExtractionOutput(
        text=full_text,
        page_count=page_count,
        truncated=truncated,
        is_empty=is_empty,
        warning=warning,
    )
