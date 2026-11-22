"""Single Source of Truth — Python Server-Side Input Validators & Normalizers (mirrored 1:1 with frontend/lib/validation.js)."""

from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi.responses import JSONResponse

EMAIL_POLICY = "ANY_VALID_DOMAIN"  # Change to "GMAIL_ONLY" to accept only @gmail.com on sign-up/profile/checkout.

PH_MOBILE_REGEX = re.compile(r"^\+63 9\d{2}-\d{3}-\d{4}$")
PH_MOBILE_ERROR = "Enter a valid PH mobile number, e.g. +63 917-123-4567."
EMAIL_ERROR = "Enter a valid email address, e.g. name@gmail.com."

ALLOWED_SHOE_SIZES = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13"]
ALLOWED_AUDIENCES = ["MEN", "WOMEN", "UNISEX"]
ALLOWED_SHOE_TYPES = ["RUNNING", "LIFESTYLE", "BASKETBALL", "TRAINING", "CASUAL", "BOOTS", "FORMAL", "LOAFERS"]
ALLOWED_TICKET_CATEGORIES = ["INQUIRY", "COMPLAINT", "CANCELLATION", "RETURN", "REFUND"]

_HTML_ANGLE_RE = re.compile(r"[<>]")
_PERSON_NAME_RE = re.compile(r"^[A-Za-z\s\-'.]+$")
_SKU_RE = re.compile(r"^[A-Za-z0-9\-_.]+$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_EMAIL_LOCAL_RE = re.compile(r"^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$")
_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
_TLD_RE = re.compile(r"^[a-z]{2,}$")
_ALLOWED_TEL_CHARS_RE = re.compile(r"^\+?[0-9\s\-()]+$")


def is_blank(raw: Any) -> bool:
    return raw is None or len(str(raw).strip()) == 0


def _fail(error: str) -> dict[str, Any]:
    return {"valid": False, "value": None, "error": error}


def _ok(value: Any) -> dict[str, Any]:
    return {"valid": True, "value": value, "error": None}


def normalize_ph_mobile(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(PH_MOBILE_ERROR) if required else _ok(None)

    trimmed = str(raw).strip()
    if not _ALLOWED_TEL_CHARS_RE.match(trimmed):
        return _fail(PH_MOBILE_ERROR)

    no_sep = re.sub(r"[\s\-()]+", "", trimmed)
    if no_sep.startswith("+"):
        if not no_sep.startswith("+63"):
            return _fail(PH_MOBILE_ERROR)
        national_digits = no_sep[3:]
    elif no_sep.startswith("09") and len(no_sep) == 11:
        national_digits = no_sep[1:]
    elif no_sep.startswith("639") and len(no_sep) == 12:
        national_digits = no_sep[2:]
    elif no_sep.startswith("9") and len(no_sep) == 10:
        national_digits = no_sep
    else:
        return _fail(PH_MOBILE_ERROR)

    if not re.match(r"^9\d{9}$", national_digits):
        return _fail(PH_MOBILE_ERROR)

    canonical = f"+63 {national_digits[0:3]}-{national_digits[3:6]}-{national_digits[6:10]}"
    return _ok(canonical)


def validate_email(
    raw: Any,
    required: bool = True,
    apply_policy: bool = True,
    policy: str = EMAIL_POLICY,
) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(EMAIL_ERROR) if required else _ok(None)

    normalized = str(raw).strip().lower()
    if len(normalized) > 254 or re.search(r"\s", normalized) or ".." in normalized:
        return _fail(EMAIL_ERROR)

    parts = normalized.split("@")
    if len(parts) != 2:
        return _fail(EMAIL_ERROR)

    local, domain = parts
    if not local or len(local) > 64 or not _EMAIL_LOCAL_RE.match(local):
        return _fail(EMAIL_ERROR)

    if not domain or len(domain) > 253 or "." not in domain:
        return _fail(EMAIL_ERROR)

    labels = domain.split(".")
    if any((not lbl or len(lbl) > 63 or not _DOMAIN_LABEL_RE.match(lbl)) for lbl in labels):
        return _fail(EMAIL_ERROR)

    if not _TLD_RE.match(labels[-1]):
        return _fail(EMAIL_ERROR)

    if apply_policy and policy == "GMAIL_ONLY" and not domain.endswith("gmail.com"):
        return _fail("Only @gmail.com email addresses are accepted.")

    return _ok(normalized)


def validate_person_name(raw: Any, label: str = "Name", required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(f"{label} is required.") if required else _ok(None)
    clean = str(raw).strip()
    if len(clean) < 2 or len(clean) > 60:
        return _fail(f"{label} must be 2–60 characters.")
    if not _PERSON_NAME_RE.match(clean):
        return _fail(f"{label} may only contain letters, spaces, hyphens, apostrophes, and periods.")
    return _ok(clean)


def validate_entity_name(raw: Any, label: str = "Name", required: bool = True, min_len: int = 2, max_len: int = 80) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(f"{label} is required.") if required else _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean):
        return _fail(f"{label} must not contain HTML tags or angle brackets.")
    if len(clean) < min_len or len(clean) > max_len:
        return _fail(f"{label} must be {min_len}–{max_len} characters.")
    return _ok(clean)


def validate_password(raw: Any, required: bool = True, check_strength: bool = True, label: str = "Password") -> dict[str, Any]:
    # Never trim passwords
    if not isinstance(raw, str) or len(raw) == 0:
        return _fail(f"{label} is required.") if required else _ok(None)
    if check_strength:
        if len(raw) < 8 or len(raw) > 128:
            return _fail(f"{label} must be at least 8 characters.")
        if not re.search(r"[A-Za-z]", raw) or not re.search(r"\d", raw):
            return _fail(f"{label} must include at least 1 letter and 1 number.")
    return _ok(raw)


def validate_street(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail("Street address is required.") if required else _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean):
        return _fail("Street address must not contain HTML tags.")
    if len(clean) < 5 or len(clean) > 200:
        return _fail("Street address must be 5–200 characters.")
    return _ok(clean)


def validate_city_or_province(raw: Any, label: str = "City", required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(f"{label} is required.") if required else _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean):
        return _fail(f"{label} must not contain HTML tags.")
    if len(clean) < 2 or len(clean) > 100:
        return _fail(f"{label} must be 2–100 characters.")
    return _ok(clean)


def validate_postal_code(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail("Postal code is required.") if required else _ok(None)
    clean = str(raw).strip()
    if not re.match(r"^\d{4}$", clean):
        return _fail("Enter a valid 4-digit Philippine postal code, e.g. 1226.")
    return _ok(clean)


def validate_optional_text(raw: Any, label: str = "Field", max_len: int = 500, min_len: int = 0) -> dict[str, Any]:
    if is_blank(raw):
        return _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean):
        return _fail(f"{label} must not contain HTML tags or angle brackets.")
    if len(clean) < min_len or len(clean) > max_len:
        prefix = f"{min_len}–" if min_len > 0 else "at most "
        return _fail(f"{label} must be {prefix}{max_len} characters.")
    return _ok(clean)


def validate_required_text(raw: Any, label: str = "Field", min_len: int = 2, max_len: int = 1000) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(f"{label} is required.")
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean):
        return _fail(f"{label} must not contain HTML tags or angle brackets.")
    if len(clean) < min_len or len(clean) > max_len:
        return _fail(f"{label} must be {min_len}–{max_len} characters.")
    return _ok(clean)


def validate_optional_url(raw: Any, label: str = "URL", max_len: int = 300) -> dict[str, Any]:
    if is_blank(raw):
        return _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean) or re.search(r"\s", clean) or len(clean) > max_len:
        return _fail(f"Enter a valid {label} (https://... or /assets/...).")
    if clean.startswith("/"):
        return _ok(clean)
    parsed = urlparse(clean)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        if parsed.scheme and parsed.scheme not in ("http", "https"):
            return _fail(f"{label} must use http://, https://, or a relative / path.")
        return _fail(f"Enter a valid {label} (https://... or /assets/...).")
    return _ok(clean)


def validate_sku(raw: Any, label: str = "SKU", required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail(f"{label} is required.") if required else _ok(None)
    clean = str(raw).strip()
    if len(clean) < 2 or len(clean) > 60 or not _SKU_RE.match(clean):
        return _fail(f"{label} must be 2–60 characters (letters, numbers, -, _, .).")
    return _ok(clean)


def validate_slug(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail("Slug is required.") if required else _ok(None)
    clean = str(raw).strip().lower()
    if len(clean) < 2 or len(clean) > 80 or not _SLUG_RE.match(clean):
        return _fail("Slug must be 2–80 lowercase letters, numbers, or hyphens.")
    return _ok(clean)


def validate_price_centavos(raw: Any, required: bool = True, label: str = "Price") -> dict[str, Any]:
    if raw is None or raw == "":
        return _fail(f"{label} is required.") if required else _ok(None)
    if isinstance(raw, bool):
        return _fail(f"{label} must be a positive centavo integer.")
    try:
        if isinstance(raw, float) and not raw.is_integer():
            return _fail(f"{label} must be greater than 0 centavos.")
        num = int(raw) if isinstance(raw, (int, float)) else int(str(raw).strip())
    except Exception:
        return _fail(f"{label} must be greater than 0 centavos.")
    if num <= 0 or num > 100_000_000:
        return _fail(f"{label} must be greater than 0 centavos.")
    return _ok(num)


def validate_stock(raw: Any, required: bool = True) -> dict[str, Any]:
    if raw is None or str(raw).strip() == "":
        return _fail("Stock quantity is required.") if required else _ok(None)
    if isinstance(raw, bool) or not re.match(r"^\d+$", str(raw).strip()):
        return _fail("Stock must be a whole number 0 or greater.")
    num = int(str(raw).strip())
    if num < 0 or num > 1_000_000:
        return _fail("Stock must be a whole number 0 or greater.")
    return _ok(num)


def validate_shoe_size(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail("Shoe size is required.") if required else _ok(None)
    clean = str(raw).strip()
    if clean not in ALLOWED_SHOE_SIZES:
        return _fail(f"Size must be one of: {', '.join(ALLOWED_SHOE_SIZES)}.")
    return _ok(clean)


def validate_color(raw: Any, required: bool = True) -> dict[str, Any]:
    if is_blank(raw):
        return _fail("Color is required.") if required else _ok(None)
    clean = str(raw).strip()
    if _HTML_ANGLE_RE.search(clean) or len(clean) < 1 or len(clean) > 60:
        return _fail("Color must be 1–60 characters without HTML tags.")
    return _ok(clean)


def validate_quantity(raw: Any, max_stock: Optional[int] = None) -> dict[str, Any]:
    if raw is None or str(raw).strip() == "" or isinstance(raw, bool):
        return _fail("Quantity must be a whole number of at least 1.")
    if not re.match(r"^\d+$", str(raw).strip()):
        return _fail("Quantity must be a whole number of at least 1.")
    qty = int(str(raw).strip())
    if qty < 1:
        return _fail("Quantity must be at least 1.")
    if max_stock is not None and qty > max_stock:
        return _fail(f"Only {max_stock} units available in stock.")
    return _ok(qty)


def collect_field_errors(checks: dict[str, dict[str, Any]]) -> dict[str, Any]:
    field_errors: dict[str, str] = {}
    values: dict[str, Any] = {}
    first_error: Optional[str] = None
    for field, res in checks.items():
        if not res["valid"]:
            field_errors[field] = res["error"]
            if first_error is None:
                first_error = res["error"]
        else:
            values[field] = res["value"]
    return {
        "ok": len(field_errors) == 0,
        "fieldErrors": field_errors,
        "values": values,
        "firstError": first_error,
    }


def validation_error_response(collected: dict[str, Any]) -> JSONResponse:
    details = [{"path": k, "msg": v} for k, v in collected["fieldErrors"].items()]
    msg = collected.get("firstError") or "Validation failed."
    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": msg,
            "fieldErrors": collected["fieldErrors"],
            "error": {
                "message": msg,
                "details": details,
            },
        },
    )
