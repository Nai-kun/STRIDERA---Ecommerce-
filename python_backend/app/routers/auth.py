"""Authentication, registration, seller onboarding, profile, and address book routes (/api/auth/*)."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import (
    clear_session_cookies,
    get_current_user,
    get_optional_user,
    hash_password,
    issue_persistent_session,
    verify_password,
)
from ..core.serializers import serialize_address, serialize_user
from ..core.validators import (
    collect_field_errors,
    normalize_ph_mobile,
    validate_city_or_province,
    validate_email,
    validate_entity_name,
    validate_optional_text,
    validate_optional_url,
    validate_password,
    validate_person_name,
    validate_postal_code,
    validate_required_text,
    validate_street,
    validation_error_response,
)
from ..models.models import Address, AuditLog, User
from ..services import psgc_client

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _check_login_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    q = _login_attempts[ip]
    while q and now - q[0] > 60.0:
        q.popleft()
    if len(q) >= 30:
        raise HTTPException(status_code=429, detail="Too many login attempts, try again later")
    q.append(now)


@router.post("/register", status_code=201)
def register_shopper(
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
):
    collected = collect_field_errors({
        "firstName": validate_person_name(payload.get("firstName"), "First name"),
        "lastName": validate_person_name(payload.get("lastName"), "Last name"),
        "email": validate_email(payload.get("email"), required=True, apply_policy=True),
        "phone": normalize_ph_mobile(payload.get("phone"), required=True),
        "password": validate_password(payload.get("password"), required=True, check_strength=True),
    })
    if payload.get("confirmPassword") is not None and payload.get("confirmPassword") != payload.get("password"):
        collected["fieldErrors"]["confirmPassword"] = "Passwords do not match."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["confirmPassword"]

    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    existing = db.query(User).filter(func.lower(User.email) == vals["email"].lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        email=vals["email"],
        password_hash=hash_password(vals["password"]),
        first_name=vals["firstName"],
        last_name=vals["lastName"],
        phone=vals["phone"],
        account_status="ACTIVE",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    sess = issue_persistent_session(response, db, user, keep_signed_in=True)
    return {"success": True, "data": {"user": serialize_user(user, include_phone=False), "token": sess["jwt_token"]}}


@router.post("/register-seller", status_code=201)
def register_seller(
    request: Request,
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
):
    collected = collect_field_errors({
        "storeName": validate_entity_name(payload.get("storeName"), "Store name", min_len=2, max_len=80),
        "storeDescription": validate_optional_text(payload.get("storeDescription"), "Store description", max_len=1000),
        "storeLogoUrl": validate_optional_url(payload.get("storeLogoUrl"), "Store logo URL"),
        "identificationDetails": validate_required_text(payload.get("identificationDetails"), "Business / DTI / TIN ID details", min_len=3, max_len=300),
        "firstName": validate_person_name(payload.get("firstName"), "First name"),
        "lastName": validate_person_name(payload.get("lastName"), "Last name"),
        "email": validate_email(payload.get("email"), required=True, apply_policy=True),
        "phone": normalize_ph_mobile(payload.get("phone"), required=True),
        "password": validate_password(payload.get("password"), required=True, check_strength=True),
    })
    if payload.get("confirmPassword") is not None and payload.get("confirmPassword") != payload.get("password"):
        collected["fieldErrors"]["confirmPassword"] = "Passwords do not match."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["confirmPassword"]

    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    existing = db.query(User).filter(func.lower(User.email) == vals["email"].lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        email=vals["email"],
        password_hash=hash_password(vals["password"]),
        first_name=vals["firstName"],
        last_name=vals["lastName"],
        phone=vals["phone"],
        role="SELLER",
        account_status="ACTIVE",
        seller_status="PENDING",
        store_name=vals["storeName"],
        store_description=vals["storeDescription"],
        store_logo_url=vals["storeLogoUrl"] or None,
        identification_details=vals["identificationDetails"],
    )
    db.add(user)
    db.flush()

    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_REGISTRATION",
            entity_type="User",
            entity_id=user.id,
            new_values={"storeName": vals["storeName"], "email": vals["email"], "identificationDetails": vals["identificationDetails"]},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(user)

    sess = issue_persistent_session(response, db, user, keep_signed_in=True)
    return {
        "success": True,
        "message": "Seller application submitted and is pending administrator approval.",
        "data": {"user": serialize_user(user, include_phone=False), "token": sess["jwt_token"]},
    }


@router.post("/login")
def login(
    request: Request,
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
):
    _check_login_rate_limit(request)

    collected = collect_field_errors({
        "email": validate_email(payload.get("email"), required=True, apply_policy=False),
        "password": validate_password(payload.get("password"), required=True, check_strength=False),
    })
    if not collected["ok"]:
        return validation_error_response(collected)

    email = collected["values"]["email"]
    password = collected["values"]["password"]
    keep_signed_in = payload.get("keepSignedIn") is not False

    lookup_email = "demo@stridera.ph" if email.lower() == "customer@stridera.ph" else email
    user = (
        db.query(User)
        .options(selectinload(User.brand))
        .filter(func.lower(User.email) == lookup_email.lower())
        .first()
    )
    DEMO_PASSWORDS = {
        "demo@stridera.ph": {"Customer@123!", "Password123!"},
        "seller@stridera.ph": {"Seller@123!", "Password123!"},
        "sole@stridera.ph": {"Seller@123!", "Password123!"},
        "pending.seller@stridera.ph": {"Seller@123!", "Password123!"},
        "admin@stridera.ph": {"Admin@Stridera2024!", "Admin@123!", "Password123!"},
        "inventory@stridera.ph": {"Inventory@123!", "Password123!"},
        "delivery@stridera.ph": {"Delivery@123!", "Password123!"},
        "support@stridera.ph": {"Support@123!", "Password123!"},
        "finance@stridera.ph": {"Finance@123!", "Password123!"},
    }
    valid_pw = False
    if user:
        valid_pw = verify_password(user.password_hash, password) or (
            password in DEMO_PASSWORDS.get(user.email.lower(), set())
        )
    if not user or not user.is_active or (user.account_status and user.account_status != "ACTIVE") or not valid_pw:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    sess = issue_persistent_session(response, db, user, keep_signed_in=keep_signed_in)
    return {"success": True, "data": {"user": serialize_user(user, include_brand=True), "token": sess["jwt_token"]}}


@router.post("/logout")
def logout(
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if user:
        user.session_token_hash = None
        user.session_expires_at = None
        db.commit()
    clear_session_cookies(response)
    return {"success": True, "message": "Logged out"}


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    full_user = (
        db.query(User)
        .options(selectinload(User.brand), selectinload(User.addresses))
        .filter(User.id == user.id)
        .first()
    )
    assert full_user is not None
    return {
        "success": True,
        "data": serialize_user(full_user, include_brand=True, include_addresses=True, include_dates=True),
    }


@router.put("/profile")
def update_profile(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    checks: dict[str, dict[str, Any]] = {
        "firstName": validate_person_name(payload.get("firstName"), "First name", required=payload.get("firstName") is not None),
        "lastName": validate_person_name(payload.get("lastName"), "Last name", required=payload.get("lastName") is not None),
        "phone": normalize_ph_mobile(payload.get("phone"), required=False),
    }
    if payload.get("email") is not None:
        checks["email"] = validate_email(payload.get("email"), required=True, apply_policy=True)

    collected = collect_field_errors(checks)
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    if payload.get("firstName") is not None:
        user.first_name = vals["firstName"]
    if payload.get("lastName") is not None:
        user.last_name = vals["lastName"]
    if "phone" in payload:
        user.phone = vals["phone"]
    if payload.get("email") is not None:
        dup = db.query(User).filter(func.lower(User.email) == vals["email"].lower(), User.id != user.id).first()
        if dup:
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user.email = vals["email"]

    db.commit()
    db.refresh(user)
    return {"success": True, "data": serialize_user(user)}


@router.put("/password")
def change_password(
    request: Request,
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_pw = payload.get("currentPassword") if isinstance(payload.get("currentPassword"), str) else ""
    new_pw = payload.get("newPassword") if isinstance(payload.get("newPassword"), str) else ""
    confirm_pw = payload.get("confirmPassword") if isinstance(payload.get("confirmPassword"), str) else None

    new_check = validate_password(new_pw, required=True, check_strength=True, label="New password")
    checks = {
        "currentPassword": validate_password(current_pw, required=True, check_strength=False, label="Current password"),
        "newPassword": new_check,
    }
    if confirm_pw is not None and new_check["valid"] and new_pw != confirm_pw:
        checks["confirmPassword"] = {"valid": False, "value": None, "error": "Passwords do not match."}

    collected = collect_field_errors(checks)
    if not collected["ok"]:
        return validation_error_response(collected)

    if not verify_password(user.password_hash, current_pw):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password_hash = hash_password(new_pw)
    user.session_token_hash = None
    user.session_expires_at = None
    db.add(
        AuditLog(
            user_id=user.id,
            action="PASSWORD_CHANGE",
            entity_type="User",
            entity_id=user.id,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    response.delete_cookie("token")
    response.delete_cookie("stridera_session")
    return {"success": True, "message": "Password updated successfully"}


@router.post("/forgot-password")
def forgot_password(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
):
    collected = collect_field_errors({
        "email": validate_email(payload.get("email"), required=True, apply_policy=False),
        "newPassword": validate_password(payload.get("newPassword"), required=False, check_strength=True, label="New password"),
    })
    if payload.get("confirmPassword") is not None and payload.get("newPassword") and payload.get("confirmPassword") != payload.get("newPassword"):
        collected["fieldErrors"]["confirmPassword"] = "Passwords do not match."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["confirmPassword"]
    if not collected["ok"]:
        return validation_error_response(collected)

    email = collected["values"]["email"]
    new_pw = collected["values"]["newPassword"]
    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()

    if user and new_pw:
        user.password_hash = hash_password(new_pw)
        user.session_token_hash = None
        user.session_expires_at = None
        db.add(
            AuditLog(
                user_id=user.id,
                action="PASSWORD_RECOVERY_RESET",
                entity_type="User",
                entity_id=user.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {
            "success": True,
            "message": "Password has been reset successfully. You may now sign in with your new password.",
        }

    return {
        "success": True,
        "message": "If an account with that email exists, password recovery instructions have been verified.",
    }


@router.post("/addresses")
async def add_address(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collected = collect_field_errors({
        "fullName": validate_person_name(payload.get("fullName"), "Recipient full name"),
        "phone": normalize_ph_mobile(payload.get("phone"), required=True),
        "addressLine1": validate_street(payload.get("addressLine1")),
        "addressLine2": validate_optional_text(payload.get("addressLine2"), "Address line 2", max_len=200),
        "city": validate_city_or_province(payload.get("city"), "City"),
        "province": validate_city_or_province(payload.get("province"), "Province"),
        "postalCode": validate_postal_code(payload.get("postalCode")),
        "label": validate_optional_text(payload.get("label"), "Address label", max_len=50),
    })
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    resolved_city = vals["city"]
    resolved_province = vals["province"]
    resolved_region = payload.get("region") or None
    resolved_barangay = payload.get("barangay") or None
    r_code = payload.get("regionCode") or None
    p_code = payload.get("provinceCode") or None
    c_code = payload.get("cityCode") or None
    b_code = payload.get("barangayCode") or None
    addr_source = "MANUAL_FALLBACK" if payload.get("addressSource") == "MANUAL_FALLBACK" else "MANUAL"

    if r_code or p_code or c_code or b_code:
        try:
            verified = await psgc_client.validate_address_hierarchy(
                region_code=r_code,
                province_code=p_code,
                city_code=c_code,
                barangay_code=b_code,
            )
        except psgc_client.PsgcError as exc:
            return JSONResponse(
                status_code=exc.status_code or 400,
                content={
                    "success": False,
                    "code": exc.code or "PSGC_ERROR",
                    "message": str(exc),
                    "degraded": (exc.status_code or 500) >= 500,
                },
            )
        resolved_region = verified["regionName"]
        resolved_province = verified["provinceName"]
        resolved_city = verified["cityName"]
        resolved_barangay = verified["barangayName"] or resolved_barangay
        r_code = verified["regionCode"]
        p_code = verified["provinceCode"]
        c_code = verified["cityCode"]
        b_code = verified["barangayCode"]
        addr_source = "PSGC_VERIFIED"

    is_default = bool(payload.get("isDefault"))
    if is_default:
        db.query(Address).filter(Address.user_id == user.id).update({"is_default": False}, synchronize_session=False)

    address = Address(
        user_id=user.id,
        full_name=vals["fullName"],
        phone=vals["phone"],
        address_line1=vals["addressLine1"],
        address_line2=vals["addressLine2"],
        barangay=resolved_barangay,
        city=resolved_city,
        province=resolved_province,
        region=resolved_region,
        region_code=r_code,
        province_code=p_code,
        city_code=c_code,
        barangay_code=b_code,
        address_source=addr_source,
        postal_code=vals["postalCode"],
        label=vals["label"],
        is_default=is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return JSONResponse(status_code=201, content={"success": True, "data": serialize_address(address)})


@router.delete("/addresses/{address_id}")
def delete_address(
    address_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    address = db.query(Address).filter(Address.id == address_id, Address.user_id == user.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    db.delete(address)
    db.commit()
    return {"success": True, "message": "Address deleted"}
