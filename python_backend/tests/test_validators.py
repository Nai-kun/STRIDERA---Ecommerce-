"""Unit tests for STRIDERA single-source-of-truth Python validators."""

from __future__ import annotations

import pytest

from python_backend.app.core.validators import (
    normalize_ph_mobile,
    validate_email,
    validate_password,
    validate_person_name,
    validate_postal_code,
    validate_price_centavos,
    validate_quantity,
    validate_stock,
)


@pytest.mark.parametrize(
    "raw",
    [
        "+63 917-123-4567",
        "09171234567",
        "9171234567",
        "+639171234567",
        "63 917 123 4567",
        "(0917) 123-4567",
    ],
)
def test_valid_ph_mobile_variants_canonicalize(raw: str) -> None:
    res = normalize_ph_mobile(raw, required=True)
    assert res["valid"] is True
    assert res["value"] == "+63 917-123-4567"
    assert res["error"] is None


@pytest.mark.parametrize(
    "raw",
    [
        "+63 817-123-4567",
        "0917123456",
        "091712345678",
        "abc",
        "+1 917-123-4567",
        "   ",
        None,
    ],
)
def test_invalid_ph_mobile_rejected(raw: str | None) -> None:
    res = normalize_ph_mobile(raw, required=True)
    assert res["valid"] is False
    assert res["error"] == "Enter a valid PH mobile number, e.g. +63 917-123-4567."


def test_optional_ph_mobile_allows_blank_rejects_invalid() -> None:
    blank = normalize_ph_mobile("   ", required=False)
    assert blank["valid"] is True
    assert blank["value"] is None

    bad = normalize_ph_mobile("08171234567", required=False)
    assert bad["valid"] is False


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("name@gmail.com", "name@gmail.com"),
        ("  Name.Last+1@Yahoo.com  ", "name.last+1@yahoo.com"),
    ],
)
def test_valid_emails_normalized_lowercase(raw: str, expected: str) -> None:
    res = validate_email(raw, required=True, apply_policy=True, policy="ANY_VALID_DOMAIN")
    assert res["valid"] is True
    assert res["value"] == expected


@pytest.mark.parametrize(
    "raw",
    [
        "name@",
        "@gmail.com",
        "name@gmail",
        "name@@gmail.com",
        "na me@gmail.com",
        "name@gmail..com",
        "   ",
        None,
    ],
)
def test_invalid_emails_rejected(raw: str | None) -> None:
    res = validate_email(raw, required=True, apply_policy=True)
    assert res["valid"] is False


def test_gmail_only_policy_enforced_when_configured() -> None:
    res = validate_email("user@yahoo.com", required=True, apply_policy=True, policy="GMAIL_ONLY")
    assert res["valid"] is False
    res_login = validate_email("user@yahoo.com", required=True, apply_policy=False, policy="GMAIL_ONLY")
    assert res_login["valid"] is True


def test_password_strength_and_non_trimming() -> None:
    assert validate_password("weak", required=True, check_strength=True)["valid"] is False
    assert validate_password("onlyletters", required=True, check_strength=True)["valid"] is False
    assert validate_password("12345678", required=True, check_strength=True)["valid"] is False
    ok = validate_password("Stridera123", required=True, check_strength=True)
    assert ok["valid"] is True
    assert ok["value"] == "Stridera123"


def test_domain_specific_validators() -> None:
    assert validate_person_name("Juan Dela Cruz")["valid"] is True
    assert validate_person_name("A")["valid"] is False
    assert validate_postal_code("1200")["valid"] is True
    assert validate_postal_code("12005")["valid"] is False
    assert validate_price_centavos(299900, required=True)["valid"] is True
    assert validate_price_centavos(0, required=True)["valid"] is False
    assert validate_stock(0)["valid"] is True
    assert validate_stock(-1)["valid"] is False
    assert validate_quantity(2, max_stock=5)["valid"] is True
    assert validate_quantity(6, max_stock=5)["valid"] is False
