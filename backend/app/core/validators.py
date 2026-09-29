import re
from typing import Optional, Tuple

# Indian Statutory Identifiers Regex
PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz][0-9A-Z]{1}$")
IFSC_REGEX = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
PIN_CODE_REGEX = re.compile(r"^[1-9][0-9]{5}$")
PHONE_REGEX = re.compile(r"^(?:\+91|0)?[6-9]\d{9}$")
EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


def clean_pan(val: Optional[str]) -> Optional[str]:
    """Strip whitespace and convert to uppercase."""
    if not val:
        return None
    cleaned = re.sub(r"\s+", "", str(val)).upper()
    return cleaned if cleaned else None


def is_valid_pan(val: Optional[str]) -> bool:
    """Validate 10-character Indian Permanent Account Number (PAN)."""
    cleaned = clean_pan(val)
    return bool(cleaned and PAN_REGEX.match(cleaned))


def clean_gstin(val: Optional[str]) -> Optional[str]:
    """Strip whitespace and convert to uppercase."""
    if not val:
        return None
    cleaned = re.sub(r"\s+", "", str(val)).upper()
    return cleaned if cleaned else None


def is_valid_gstin(val: Optional[str]) -> bool:
    """Validate 15-character Indian Goods and Services Tax Identification Number (GSTIN)."""
    cleaned = clean_gstin(val)
    return bool(cleaned and GSTIN_REGEX.match(cleaned))


def validate_gstin_matches_pan(gstin: Optional[str], pan: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Check if the PAN embedded within the GSTIN (characters 3-12) matches the company PAN.
    Returns (is_match, extracted_pan_from_gstin).
    """
    c_gstin = clean_gstin(gstin)
    c_pan = clean_pan(pan)
    if not c_gstin or not c_pan or len(c_gstin) < 12:
        return True, None
    extracted = c_gstin[2:12]
    return (extracted == c_pan, extracted)


def clean_ifsc(val: Optional[str]) -> Optional[str]:
    """Strip whitespace and convert to uppercase."""
    if not val:
        return None
    cleaned = re.sub(r"\s+", "", str(val)).upper()
    return cleaned if cleaned else None


def is_valid_ifsc(val: Optional[str]) -> bool:
    """Validate 11-character Indian Financial System Code (IFSC)."""
    cleaned = clean_ifsc(val)
    return bool(cleaned and IFSC_REGEX.match(cleaned))


def clean_pin_code(val: Optional[str]) -> Optional[str]:
    """Strip non-digits and limit to 6 digits."""
    if not val:
        return None
    cleaned = re.sub(r"\D", "", str(val))[:6]
    return cleaned if cleaned else None


def is_valid_pin_code(val: Optional[str]) -> bool:
    """Validate 6-digit Indian Postal PIN Code."""
    cleaned = clean_pin_code(val)
    return bool(cleaned and PIN_CODE_REGEX.match(cleaned))


def clean_phone(val: Optional[str]) -> Optional[str]:
    """Strip non-phone formatting symbols."""
    if not val:
        return None
    cleaned = re.sub(r"[\s\-\(\)]+", "", str(val))
    return cleaned if cleaned else None


def is_valid_phone(val: Optional[str]) -> bool:
    """Validate Indian 10-digit mobile number with optional +91 or 0 prefix."""
    cleaned = clean_phone(val)
    return bool(cleaned and PHONE_REGEX.match(cleaned))
