// Statutory Indian format validators for SRM

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz][0-9A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const PIN_CODE_REGEX = /^[1-9][0-9]{5}$/;
export const PHONE_REGEX = /^(?:\+91|0)?[6-9]\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanPan(val?: string | null): string {
  return (val || "").replace(/\s+/g, "").toUpperCase();
}

export function isValidPan(val?: string | null): boolean {
  const pan = cleanPan(val);
  return PAN_REGEX.test(pan);
}

export function cleanGstin(val?: string | null): string {
  return (val || "").replace(/\s+/g, "").toUpperCase();
}

export function isValidGstin(val?: string | null): boolean {
  const gstin = cleanGstin(val);
  return GSTIN_REGEX.test(gstin);
}

export function gstinMatchesPan(gstin?: string | null, pan?: string | null): { matches: boolean; gstinPan?: string } {
  const cGstin = cleanGstin(gstin);
  const cPan = cleanPan(pan);
  if (!cGstin || !cPan || cGstin.length < 12) {
    return { matches: true };
  }
  const extractedPan = cGstin.substring(2, 12);
  return {
    matches: extractedPan === cPan,
    gstinPan: extractedPan,
  };
}

export function cleanIfsc(val?: string | null): string {
  return (val || "").replace(/\s+/g, "").toUpperCase();
}

export function isValidIfsc(val?: string | null): boolean {
  const ifsc = cleanIfsc(val);
  return IFSC_REGEX.test(ifsc);
}

export function cleanPinCode(val?: string | null): string {
  return (val || "").replace(/\D/g, "").slice(0, 6);
}

export function isValidPinCode(val?: string | null): boolean {
  const pin = cleanPinCode(val);
  return PIN_CODE_REGEX.test(pin);
}

export function cleanPhone(val?: string | null): string {
  return (val || "").replace(/[^\d+]/g, "");
}

export function isValidPhone(val?: string | null): boolean {
  const phone = cleanPhone(val);
  return PHONE_REGEX.test(phone);
}
