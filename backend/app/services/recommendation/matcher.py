"""
Deterministic attribute matcher for Phase 3E.

This module performs structured, rule-based scoring of candidate products
against a ParsedRequirement. It NEVER calls Gemini. All scoring is
deterministic and auditable.

Scoring model (composite = weighted sum):
  - Semantic similarity (from Qdrant): 40%     → passed in by caller
  - Attribute match (this module):     40%
  - Certification match:               10%
  - Metadata completeness bonus:       10%

Hard constraint violations set the composite score to 0.0.

Hard constraints:
  - product_type mismatch (if specified and not found in product text)
  - power_watts mismatch (>20% relative tolerance)
  - color_temperature_k mismatch (>20% relative tolerance)
  - required certification absent from product attributes
  - brand mismatch (if specified as exact)
  - model mismatch (if specified as exact)
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.recommendation.parser import ParsedRequirement

logger = logging.getLogger(__name__)

# Tolerance for numeric spec comparison (e.g. power, color temp)
_NUMERIC_TOLERANCE = 0.20  # 20%

# Confidence thresholds
_HIGH_THRESHOLD = 0.75
_MEDIUM_THRESHOLD = 0.45


def _parse_attrs(attrs_json: Optional[str]) -> Dict[str, Any]:
    """Parse the attributes_json field from CatalogProductDraft safely."""
    if not attrs_json:
        return {}
    try:
        data = json.loads(attrs_json)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, ValueError):
        return {}


def _text_contains_keyword(text: str, keyword: str) -> bool:
    """Case-insensitive whole-word / phrase check."""
    if not text or not keyword:
        return False
    pattern = re.compile(re.escape(keyword.strip()), re.IGNORECASE)
    return bool(pattern.search(text))


def _product_full_text(product_name: Optional[str], description: Optional[str], attrs: Dict[str, Any]) -> str:
    """Concatenate all product text fields for keyword matching."""
    parts = [product_name or "", description or ""]
    for v in attrs.values():
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, (int, float)):
            parts.append(str(v))
    return " ".join(parts).lower()


def _extract_numeric(attrs: Dict[str, Any], keys: List[str]) -> Optional[float]:
    """Try to find a numeric value from known attribute key names."""
    for key in keys:
        for k, v in attrs.items():
            if key.lower() in k.lower():
                if isinstance(v, (int, float)):
                    return float(v)
                # Try to parse a number from a string like "18W" or "6500K"
                if isinstance(v, str):
                    m = re.search(r"[\d.]+", v)
                    if m:
                        return float(m.group())
    return None


def score_candidate(
    requirement: ParsedRequirement,
    product_name: Optional[str],
    description: Optional[str],
    attributes_json: Optional[str],
    semantic_score: float,   # 0.0–1.0 from Qdrant
) -> Tuple[float, str, List[str], List[str]]:
    """
    Score a single candidate product against a requirement.

    Returns:
        (composite_score, confidence_label, match_reasons, mismatch_reasons)
        composite_score: 0.0–1.0
        confidence_label: "HIGH" | "MEDIUM" | "LOW"
    """
    attrs = _parse_attrs(attributes_json)
    full_text = _product_full_text(product_name, description, attrs)

    match_reasons: List[str] = []
    mismatch_reasons: List[str] = []
    hard_fail = False

    # -----------------------------------------------------------------------
    # 1. Product type check (hard constraint if specified)
    # -----------------------------------------------------------------------
    if requirement.product_type:
        if _text_contains_keyword(full_text, requirement.product_type):
            match_reasons.append(f"Product type matches: '{requirement.product_type}'")
        else:
            mismatch_reasons.append(
                f"Product type '{requirement.product_type}' not found in product description"
            )
            hard_fail = True

    # -----------------------------------------------------------------------
    # 2. Power (watts) — hard constraint with numeric tolerance
    # -----------------------------------------------------------------------
    attr_score_components: List[float] = []

    if requirement.power_watts is not None:
        candidate_power = _extract_numeric(attrs, ["power", "watt", "w"])
        if candidate_power is not None:
            diff = abs(candidate_power - requirement.power_watts)
            rel_err = diff / requirement.power_watts if requirement.power_watts else 1.0
            if rel_err <= _NUMERIC_TOLERANCE:
                match_reasons.append(
                    f"Power matches: required {requirement.power_watts}W, "
                    f"found {candidate_power}W"
                )
                attr_score_components.append(1.0)
            else:
                pct = rel_err * 100
                mismatch_reasons.append(
                    f"Power mismatch: required {requirement.power_watts}W, "
                    f"found {candidate_power}W ({pct:.0f}% deviation)"
                )
                hard_fail = True
                attr_score_components.append(0.0)
        else:
            mismatch_reasons.append("Power not specified in catalog")
            attr_score_components.append(0.3)  # partial credit for ambiguity

    # -----------------------------------------------------------------------
    # 3. Color temperature — hard constraint with tolerance
    # -----------------------------------------------------------------------
    if requirement.color_temperature_k is not None:
        candidate_ct = _extract_numeric(attrs, ["color_temp", "kelvin", "cct", "k", "colour"])
        if candidate_ct is not None:
            diff = abs(candidate_ct - requirement.color_temperature_k)
            rel_err = diff / requirement.color_temperature_k if requirement.color_temperature_k else 1.0
            if rel_err <= _NUMERIC_TOLERANCE:
                match_reasons.append(
                    f"Color temperature matches: required {requirement.color_temperature_k}K, "
                    f"found {candidate_ct}K"
                )
                attr_score_components.append(1.0)
            else:
                mismatch_reasons.append(
                    f"Color temperature mismatch: required {requirement.color_temperature_k}K, "
                    f"found {candidate_ct}K"
                )
                hard_fail = True
                attr_score_components.append(0.0)
        else:
            mismatch_reasons.append("Color temperature not specified in catalog")
            attr_score_components.append(0.3)

    # -----------------------------------------------------------------------
    # 4. Certifications — hard constraint if specified
    # -----------------------------------------------------------------------
    cert_score = 0.0
    if requirement.certifications:
        found_certs = []
        missing_certs = []
        for cert in requirement.certifications:
            if _text_contains_keyword(full_text, cert):
                found_certs.append(cert)
            else:
                missing_certs.append(cert)
        if found_certs:
            match_reasons.append(f"Certifications present: {', '.join(found_certs)}")
        if missing_certs:
            mismatch_reasons.append(f"Required certifications not found: {', '.join(missing_certs)}")
            hard_fail = True
        total_certs = len(requirement.certifications)
        cert_score = len(found_certs) / total_certs if total_certs else 1.0
    else:
        cert_score = 1.0  # no cert requirement — full marks

    # -----------------------------------------------------------------------
    # 5. Brand match (hard constraint if specified)
    # -----------------------------------------------------------------------
    if requirement.brand:
        if _text_contains_keyword(full_text, requirement.brand):
            match_reasons.append(f"Brand matches: '{requirement.brand}'")
            attr_score_components.append(1.0)
        else:
            mismatch_reasons.append(f"Required brand '{requirement.brand}' not found")
            hard_fail = True
            attr_score_components.append(0.0)

    # -----------------------------------------------------------------------
    # 6. Model match (hard constraint if specified)
    # -----------------------------------------------------------------------
    if requirement.model:
        if _text_contains_keyword(full_text, requirement.model):
            match_reasons.append(f"Model matches: '{requirement.model}'")
            attr_score_components.append(1.0)
        else:
            mismatch_reasons.append(f"Required model '{requirement.model}' not found")
            hard_fail = True
            attr_score_components.append(0.0)

    # -----------------------------------------------------------------------
    # 7. Quantity note (soft — we don't know vendor inventory)
    # -----------------------------------------------------------------------
    if requirement.quantity is not None:
        mismatch_reasons.append(
            f"Quantity requested: {requirement.quantity} {requirement.unit or 'units'} — "
            "supply capacity not confirmed in catalog"
        )

    # -----------------------------------------------------------------------
    # 8. Price note (soft — advisory only)
    # -----------------------------------------------------------------------
    candidate_price = _extract_numeric(attrs, ["price", "cost", "rate", "mrp"])
    if requirement.max_price is not None:
        if candidate_price is not None:
            if candidate_price <= requirement.max_price:
                match_reasons.append(
                    f"Price within budget: {candidate_price} ≤ {requirement.max_price} "
                    f"{requirement.currency or ''}"
                )
                attr_score_components.append(1.0)
            else:
                mismatch_reasons.append(
                    f"Price {candidate_price} exceeds budget {requirement.max_price} "
                    f"{requirement.currency or ''}"
                )
                attr_score_components.append(0.0)
        else:
            mismatch_reasons.append("Price not available in catalog")
            attr_score_components.append(0.3)

    # -----------------------------------------------------------------------
    # 9. Metadata completeness bonus
    # -----------------------------------------------------------------------
    non_empty_fields = sum(1 for v in attrs.values() if v not in (None, "", []))
    completeness_score = min(non_empty_fields / max(5, len(attrs) if attrs else 1), 1.0)

    # -----------------------------------------------------------------------
    # Hard fail override
    # -----------------------------------------------------------------------
    if hard_fail:
        return 0.0, "LOW", match_reasons, mismatch_reasons

    # -----------------------------------------------------------------------
    # Composite score computation
    # -----------------------------------------------------------------------
    attribute_score = (
        (sum(attr_score_components) / len(attr_score_components))
        if attr_score_components
        else 0.5  # neutral if no structured specs were checked
    )

    composite = (
        semantic_score    * 0.40 +
        attribute_score   * 0.40 +
        cert_score        * 0.10 +
        completeness_score * 0.10
    )
    composite = max(0.0, min(1.0, composite))

    if composite >= _HIGH_THRESHOLD:
        confidence = "HIGH"
    elif composite >= _MEDIUM_THRESHOLD:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return composite, confidence, match_reasons, mismatch_reasons
