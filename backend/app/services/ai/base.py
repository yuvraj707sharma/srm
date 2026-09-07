"""
Abstract base class for AI catalog extraction providers.

The application should only depend on this interface.
Provider-specific code lives in the concrete implementations.
"""
from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic schemas for structured Gemini output
# ---------------------------------------------------------------------------

class ExtractedProduct(BaseModel):
    """
    Represents a single product extracted from a vendor catalog.
    All fields are optional because real-world catalogs vary enormously.
    """
    product_name: Optional[str] = Field(None, description="Product/item name")
    description: Optional[str] = Field(None, description="Full product description")
    category: Optional[str] = Field(None, description="Product category or sub-category")
    sku: Optional[str] = Field(None, description="Stock-keeping unit or part number")
    unit: Optional[str] = Field(None, description="Unit of measure (e.g. 'piece', 'kg', 'litre')")
    price: Optional[float] = Field(None, description="Numeric price value, if present")
    currency: Optional[str] = Field(None, description="ISO 4217 currency code, e.g. INR, USD")
    specifications: Optional[str] = Field(None, description="Technical specifications, dimensions, material, etc.")


class CatalogExtractionResult(BaseModel):
    """
    Top-level schema returned by any AI extraction provider.
    """
    products: list[ExtractedProduct] = Field(default_factory=list)
    truncated: bool = Field(False, description="True when the source document was truncated before sending to AI")
    extraction_notes: Optional[str] = Field(None, description="Any notes about extraction quality or limitations")


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------

class AIExtractionProvider(ABC):
    """
    Abstract provider for AI-assisted catalog extraction.
    Concrete implementations must override extract_catalog().
    """

    @abstractmethod
    async def extract_catalog(
        self,
        catalog_text: str,
        truncated: bool = False,
    ) -> CatalogExtractionResult:
        """
        Given pre-extracted text from a catalog document, call the AI and
        return a validated CatalogExtractionResult.

        Raises:
            ExtractionProviderError  – on provider failure (timeout, auth, etc.)
            ExtractionValidationError – on schema validation failure
        """

    @abstractmethod
    async def extract_catalog_from_document(
        self,
        document_bytes: bytes,
        mime_type: str,
    ) -> CatalogExtractionResult:
        """
        Given raw document bytes (e.g. PDF), call the AI provider's native
        document parsing capabilities to extract the catalog.
        
        Raises:
            ExtractionProviderError  – on provider failure
            ExtractionValidationError – on schema validation failure
        """

    # Sentinel exception classes – callers import these from base, not from
    # the concrete implementation, keeping the interface clean.
    class ExtractionProviderError(Exception):
        """Raised when the upstream AI provider itself fails."""

    class ExtractionValidationError(Exception):
        """Raised when the AI returns output that fails Pydantic validation."""
