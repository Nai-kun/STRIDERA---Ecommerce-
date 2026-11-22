// Single Source of Truth — STRIDERA Client-Side Validators & Input Formatters
// Rules match backend/src/lib/validators.js identically. Server validation remains authoritative.

export const EMAIL_POLICY = 'ANY_VALID_DOMAIN';
export const PH_MOBILE_REGEX = /^\+63 9\d{2}-\d{3}-\d{4}$/;
export const PH_MOBILE_ERROR = 'Enter a valid PH mobile number, e.g. +63 917-123-4567.';
export const EMAIL_ERROR = 'Enter a valid email address, e.g. name@gmail.com.';

export const ALLOWED_SHOE_SIZES = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];
export const ALLOWED_AUDIENCES = ['MEN', 'WOMEN', 'UNISEX'];
export const ALLOWED_SHOE_TYPES = ['RUNNING', 'LIFESTYLE', 'BASKETBALL', 'TRAINING', 'CASUAL', 'BOOTS', 'FORMAL', 'LOAFERS'];

const HTML_TAG_OR_ANGLE_REGEX = /[<>]/;
const PERSON_NAME_REGEX = /^[A-Za-z\s\-'.]+$/;
const SKU_REGEX = /^[A-Za-z0-9\-_.]+$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_LOCAL_REGEX = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TLD_REGEX = /^[a-z]{2,}$/;

export function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim().length === 0;
}

export function isEmptyPhPrefix(raw) {
  if (isBlank(raw)) return true;
  const trimmed = String(raw).trim();
  return trimmed === '+63' || trimmed === '+6';
}

/**
 * Format typed/pasted PH mobile number cleanly while preserving fixed '+63 ' prefix.
 */
export function formatPhMobileInput(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('63') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let formatted = digits.slice(0, 3);
  if (digits.length > 3) formatted += '-' + digits.slice(3, 6);
  if (digits.length > 6) formatted += '-' + digits.slice(6, 10);
  return '+63 ' + formatted;
}

/**
 * Prevent erasing the fixed '+63 ' prefix and block non-numeric typing keys.
 */
export function handlePhMobileKeyDown(e) {
  const start = e.currentTarget.selectionStart ?? 0;
  const end = e.currentTarget.selectionEnd ?? 0;
  if ((e.key === 'Backspace' || e.key === 'Delete') && start <= 4 && end <= 4) {
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const navKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', 'Enter'];
  if (navKeys.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
}

export function normalizePhMobile(raw, { required = true } = {}) {
  if (isEmptyPhPrefix(raw)) {
    return required
      ? { valid: false, value: null, error: PH_MOBILE_ERROR }
      : { valid: true, value: null, error: null };
  }

  const trimmed = String(raw).trim();
  if (!/^\+?[0-9\s\-()]+$/.test(trimmed)) {
    return { valid: false, value: null, error: PH_MOBILE_ERROR };
  }

  const noSep = trimmed.replace(/[\s\-()]+/g, '');
  let nationalDigits = null;

  if (noSep.startsWith('+')) {
    if (!noSep.startsWith('+63')) {
      return { valid: false, value: null, error: PH_MOBILE_ERROR };
    }
    nationalDigits = noSep.slice(3);
  } else if (noSep.startsWith('09') && noSep.length === 11) {
    nationalDigits = noSep.slice(1);
  } else if (noSep.startsWith('639') && noSep.length === 12) {
    nationalDigits = noSep.slice(2);
  } else if (noSep.startsWith('9') && noSep.length === 10) {
    nationalDigits = noSep;
  } else {
    return { valid: false, value: null, error: PH_MOBILE_ERROR };
  }

  if (!/^9\d{9}$/.test(nationalDigits)) {
    return { valid: false, value: null, error: PH_MOBILE_ERROR };
  }

  const canonical = `+63 ${nationalDigits.slice(0, 3)}-${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6, 10)}`;
  return { valid: true, value: canonical, error: null };
}

export function validateEmail(raw, { required = true, applyPolicy = true, policy = EMAIL_POLICY } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: EMAIL_ERROR }
      : { valid: true, value: null, error: null };
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized.length > 254 || /\s/.test(normalized) || normalized.includes('..')) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  const [local, domain] = parts;
  if (!local || local.length > 64 || !EMAIL_LOCAL_REGEX.test(local)) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  if (!domain || domain.length > 253 || !domain.includes('.')) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  const labels = domain.split('.');
  if (labels.some((lbl) => !lbl || lbl.length > 63 || !DOMAIN_LABEL_REGEX.test(lbl))) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  if (!TLD_REGEX.test(labels[labels.length - 1])) {
    return { valid: false, value: null, error: EMAIL_ERROR };
  }

  if (applyPolicy && policy === 'GMAIL_ONLY' && !domain.endsWith('gmail.com')) {
    return { valid: false, value: null, error: 'Only @gmail.com email addresses are accepted.' };
  }

  return { valid: true, value: normalized, error: null };
}

export function validatePersonName(raw, label = 'Name', { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (clean.length < 2 || clean.length > 60) {
    return { valid: false, value: null, error: `${label} must be 2–60 characters.` };
  }
  if (!PERSON_NAME_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} may only contain letters, spaces, hyphens, apostrophes, and periods.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validateEntityName(raw, label = 'Name', { required = true, min = 2, max = 80 } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} must not contain HTML tags or angle brackets.` };
  }
  if (clean.length < min || clean.length > max) {
    return { valid: false, value: null, error: `${label} must be ${min}–${max} characters.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validatePassword(raw, { required = true, checkStrength = true, label = 'Password' } = {}) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  if (checkStrength) {
    if (raw.length < 8 || raw.length > 128) {
      return { valid: false, value: null, error: `${label} must be at least 8 characters.` };
    }
    if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) {
      return { valid: false, value: null, error: `${label} must include at least 1 letter and 1 number.` };
    }
  }
  return { valid: true, value: raw, error: null };
}

export function validateStreet(raw, { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: 'Street address is required.' }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean)) {
    return { valid: false, value: null, error: 'Street address must not contain HTML tags.' };
  }
  if (clean.length < 5 || clean.length > 200) {
    return { valid: false, value: null, error: 'Street address must be 5–200 characters.' };
  }
  return { valid: true, value: clean, error: null };
}

export function validateCityOrProvince(raw, label = 'City', { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} must not contain HTML tags.` };
  }
  if (clean.length < 2 || clean.length > 100) {
    return { valid: false, value: null, error: `${label} must be 2–100 characters.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validatePostalCode(raw, { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: 'Postal code is required.' }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (!/^\d{4}$/.test(clean)) {
    return { valid: false, value: null, error: 'Enter a valid 4-digit Philippine postal code, e.g. 1226.' };
  }
  return { valid: true, value: clean, error: null };
}

export function validateOptionalText(raw, label = 'Field', { max = 500, min = 0 } = {}) {
  if (isBlank(raw)) {
    return { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} must not contain HTML tags or angle brackets.` };
  }
  if (clean.length < min || clean.length > max) {
    return { valid: false, value: null, error: `${label} must be ${min > 0 ? `${min}–` : 'at most '}${max} characters.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validateRequiredText(raw, label = 'Field', { min = 2, max = 1000 } = {}) {
  if (isBlank(raw)) {
    return { valid: false, value: null, error: `${label} is required.` };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} must not contain HTML tags or angle brackets.` };
  }
  if (clean.length < min || clean.length > max) {
    return { valid: false, value: null, error: `${label} must be ${min}–${max} characters.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validateOptionalUrl(raw, label = 'URL', { max = 300 } = {}) {
  if (isBlank(raw)) {
    return { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean) || /\s/.test(clean) || clean.length > max) {
    return { valid: false, value: null, error: `Enter a valid ${label} (https://... or /assets/...).` };
  }
  if (clean.startsWith('/')) {
    return { valid: true, value: clean, error: null };
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, value: null, error: `${label} must use http://, https://, or a relative / path.` };
    }
    return { valid: true, value: clean, error: null };
  } catch {
    return { valid: false, value: null, error: `Enter a valid ${label} (https://... or /assets/...).` };
  }
}

export function validateSku(raw, label = 'SKU', { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (clean.length < 2 || clean.length > 60 || !SKU_REGEX.test(clean)) {
    return { valid: false, value: null, error: `${label} must be 2–60 characters (letters, numbers, -, _, .).` };
  }
  return { valid: true, value: clean, error: null };
}

export function validateSlug(raw, { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: 'Slug is required.' }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim().toLowerCase();
  if (clean.length < 2 || clean.length > 80 || !SLUG_REGEX.test(clean)) {
    return { valid: false, value: null, error: 'Slug must be 2–80 lowercase letters, numbers, or hyphens.' };
  }
  return { valid: true, value: clean, error: null };
}

export function validatePricePesos(raw, { required = true, label = 'Price' } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: `${label} is required.` }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) {
    return { valid: false, value: null, error: `${label} must be greater than 0 with at most 2 decimal places.` };
  }
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0 || num > 1000000) {
    return { valid: false, value: null, error: `${label} must be greater than 0 (max ₱1,000,000).` };
  }
  const centavos = Math.round(num * 100);
  if (centavos <= 0) {
    return { valid: false, value: null, error: `${label} must be greater than 0.` };
  }
  return { valid: true, value: centavos, error: null };
}

export function validateStock(raw, { required = true } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return required
      ? { valid: false, value: null, error: 'Stock quantity is required.' }
      : { valid: true, value: null, error: null };
  }
  if (!/^\d+$/.test(String(raw).trim())) {
    return { valid: false, value: null, error: 'Stock must be a whole number 0 or greater.' };
  }
  const num = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(num) || num < 0 || num > 1000000) {
    return { valid: false, value: null, error: 'Stock must be a whole number 0 or greater.' };
  }
  return { valid: true, value: num, error: null };
}

export function validateShoeSize(raw, { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: 'Shoe size is required.' }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (!ALLOWED_SHOE_SIZES.includes(clean)) {
    return { valid: false, value: null, error: `Size must be one of: ${ALLOWED_SHOE_SIZES.join(', ')}.` };
  }
  return { valid: true, value: clean, error: null };
}

export function validateColor(raw, { required = true } = {}) {
  if (isBlank(raw)) {
    return required
      ? { valid: false, value: null, error: 'Color is required.' }
      : { valid: true, value: null, error: null };
  }
  const clean = String(raw).trim();
  if (HTML_TAG_OR_ANGLE_REGEX.test(clean) || clean.length < 1 || clean.length > 60) {
    return { valid: false, value: null, error: 'Color must be 1–60 characters without HTML tags.' };
  }
  return { valid: true, value: clean, error: null };
}

export function validateQuantity(raw, maxStock = null) {
  if (raw === undefined || raw === null || !/^\d+$/.test(String(raw).trim())) {
    return { valid: false, value: null, error: 'Quantity must be a whole number of at least 1.' };
  }
  const qty = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(qty) || qty < 1) {
    return { valid: false, value: null, error: 'Quantity must be at least 1.' };
  }
  if (maxStock !== null && maxStock !== undefined && qty > maxStock) {
    return { valid: false, value: null, error: `Only ${maxStock} units available in stock.` };
  }
  return { valid: true, value: qty, error: null };
}

export function focusFirstInvalidField(errors, fieldIdMap) {
  if (typeof document === 'undefined' || !errors) return;
  for (const field of Object.keys(errors)) {
    if (!errors[field]) continue;
    const domId = fieldIdMap?.[field] || field;
    const el = document.getElementById(domId);
    if (el && typeof el.focus === 'function') {
      el.focus();
      break;
    }
  }
}
