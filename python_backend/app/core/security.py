"""Authentication, Argon2 password hashing, persistent SHA-256 sessions, RBAC dependencies & AES-256-GCM settings crypto."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from ..models.models import User

_ph = PasswordHasher()


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    if not password_hash or not isinstance(password, str):
        return False
    # Normalize Node argon2 PHC param order ($m=...,p=...,t=...$) to libargon2 canonical order ($m=...,t=...,p=...$)
    normalized_hash = re.sub(r"\$(m=\d+),p=(\d+),t=(\d+)\$", r"$\1,t=\3,p=\2$", password_hash)
    try:
        return bool(_ph.verify(normalized_hash, password))
    except (VerifyMismatchError, InvalidHashError, Exception):
        return False


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token).encode("utf-8")).hexdigest()


def _parse_expires_seconds(expr: str) -> int:
    s = str(expr or "7d").strip().lower()
    if s.endswith("d") and s[:-1].isdigit():
        return int(s[:-1]) * 86400
    if s.endswith("h") and s[:-1].isdigit():
        return int(s[:-1]) * 3600
    if s.isdigit():
        return int(s)
    return 7 * 86400


def issue_persistent_session(response: Response, db: Session, user: User, keep_signed_in: bool = True) -> dict:
    """Create persistent SHA-256 session cookie + JWT matching existing Node Express behavior."""
    settings = get_settings()
    raw_session_token = secrets.token_hex(48)
    session_hash = hash_session_token(raw_session_token)
    max_age_sec = (30 if keep_signed_in else 1) * 86400
    expires_at = utcnow_naive() + timedelta(seconds=max_age_sec)

    user.session_token_hash = session_hash
    user.session_expires_at = expires_at
    user.last_login_at = utcnow_naive()
    user.last_seen_at = utcnow_naive()
    db.commit()

    jwt_ttl = max_age_sec if keep_signed_in else _parse_expires_seconds(settings.jwt_expires_in)
    now_dt = datetime.now(timezone.utc)
    jwt_token = jwt.encode(
        {
            "userId": user.id,
            "role": user.role,
            "sid": session_hash[:16],
            "iat": int(now_dt.timestamp()),
            "exp": int((now_dt + timedelta(seconds=jwt_ttl)).timestamp()),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    cookie_kwargs = {
        "httponly": True,
        "secure": settings.cookie_secure or settings.node_env == "production",
        "samesite": "lax",
        "max_age": max_age_sec,
        "path": "/",
    }
    response.set_cookie("token", jwt_token, **cookie_kwargs)
    response.set_cookie("stridera_session", raw_session_token, **cookie_kwargs)
    return {"jwt_token": jwt_token, "raw_session_token": raw_session_token, "expires_at": expires_at}


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie("token", path="/")
    response.delete_cookie("stridera_session", path="/")


def _touch_last_seen(db: Session, user: User) -> None:
    now = utcnow_naive()
    if not user.last_seen_at or (now - user.last_seen_at).total_seconds() > 60:
        user.last_seen_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()


def resolve_user_from_request(request: Request, db: Session) -> Optional[User]:
    settings = get_settings()
    raw_session = request.cookies.get("stridera_session")
    if raw_session:
        token_hash = hash_session_token(raw_session)
        user = db.execute(select(User).where(User.session_token_hash == token_hash)).scalar_one_or_none()
        if user and (not user.session_expires_at or user.session_expires_at > utcnow_naive()):
            return user

    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get("token")
    if not token:
        return None

    decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    user = db.execute(select(User).where(User.id == decoded.get("userId"))).scalar_one_or_none()
    if not user:
        return None

    if user.session_expires_at and user.session_expires_at <= utcnow_naive():
        return None
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    try:
        user = resolve_user_from_request(request, db)
        if user and user.is_active and (not user.account_status or user.account_status == "ACTIVE"):
            _touch_last_seen(db, user)
            return user
    except Exception:
        return None
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    try:
        user = resolve_user_from_request(request, db)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not user or not user.is_active or (user.account_status and user.account_status != "ACTIVE"):
        raise HTTPException(status_code=401, detail="Authentication required or session expired")

    _touch_last_seen(db, user)
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_seller(user: User = Depends(get_current_user)) -> User:
    if user.role != "SELLER":
        raise HTTPException(status_code=404, detail="Not found")
    if user.seller_status != "APPROVED":
        raise HTTPException(status_code=403, detail="Seller account not approved")
    return user


def require_inventory(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("INVENTORY_MANAGER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Inventory Manager access required")
    return user


def require_delivery(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("DELIVERY_PERSONNEL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Delivery Personnel access required")
    return user


def require_support(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("CUSTOMER_SUPPORT", "ADMIN"):
        raise HTTPException(status_code=403, detail="Customer Support access required")
    return user


def require_finance(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("FINANCE_OFFICER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Finance Officer access required")
    return user


# AES-256-GCM settings encryption compatible with Node backend's ivHex:tagHex:cipherHex format
def _get_aes_key() -> bytes:
    settings = get_settings()
    raw_key = settings.settings_encryption_key or "stridera-dev-settings-encryption-key-2026"
    return hashlib.sha256(str(raw_key).encode("utf-8")).digest()


def encrypt_setting(plaintext: str) -> str:
    iv = os.urandom(12)
    aesgcm = AESGCM(_get_aes_key())
    ct_and_tag = aesgcm.encrypt(iv, str(plaintext).encode("utf-8"), None)
    ciphertext, tag = ct_and_tag[:-16], ct_and_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt_setting(payload: str) -> str:
    if not payload or ":" not in payload:
        return ""
    parts = payload.split(":")
    if len(parts) != 3:
        return ""
    iv_hex, tag_hex, data_hex = parts
    aesgcm = AESGCM(_get_aes_key())
    plaintext = aesgcm.decrypt(bytes.fromhex(iv_hex), bytes.fromhex(data_hex) + bytes.fromhex(tag_hex), None)
    return plaintext.decode("utf-8")


def mask_secret(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    s = str(val)
    if len(s) <= 4:
        return "••••"
    return f"••••••••{s[-4:]}"


def assert_sandbox_key(val: Optional[str], field_name: str = "API key") -> None:
    if not val:
        return
    lower = str(val).lower()
    if lower.startswith("sk_live") or lower.startswith("pk_live") or "_live_" in lower:
        raise HTTPException(status_code=400, detail=f"Live-mode {field_name} is rejected. Sandbox/test keys only.")
