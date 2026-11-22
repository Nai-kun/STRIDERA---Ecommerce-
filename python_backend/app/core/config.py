"""Centralized application configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Load backend/.env then root .env without overriding explicit OS environment variables
load_dotenv(PROJECT_ROOT / "backend" / ".env", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=False)


def _normalize_sqlalchemy_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]
    # Avoid slow IPv6 ::1 resolution attempts on Windows for local PGlite socket server
    url = url.replace("@localhost:", "@127.0.0.1:")
    return url


class Settings:
    def __init__(self) -> None:
        self.node_env: str = os.getenv("NODE_ENV", "development")
        self.port: int = int(os.getenv("PORT", "5000"))
        self.frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"

        raw_db = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/stridera")
        self.raw_database_url: str = raw_db
        self.database_url: str = _normalize_sqlalchemy_url(raw_db)

        self.jwt_secret: str = os.getenv("JWT_SECRET", "stridera-dev-secret-key-2026")
        self.jwt_expires_in: str = os.getenv("JWT_EXPIRES_IN", "30d")
        self.settings_encryption_key: str = os.getenv("SETTINGS_ENCRYPTION_KEY") or self.jwt_secret

        self.demo_mode: bool = os.getenv("DEMO_MODE", "false").lower() == "true"
        self.demo_fallback_enabled: bool = (
            os.getenv("DEMO_FALLBACK_ENABLED", "false").lower() != "false" and self.demo_mode
        )
        self.default_shipping_fee_centavos: int = int(os.getenv("DEFAULT_SHIPPING_FEE_CENTAVOS", "15000"))

        # External API #1 — PSGC Philippine Address API
        self.psgc_api_base_url: str = os.getenv("PSGC_API_BASE_URL", "https://psgc.gitlab.io/api").strip().rstrip("/")
        self.psgc_timeout_ms: int = int(os.getenv("PSGC_TIMEOUT_MS", "8000"))
        self.psgc_max_retries: int = int(os.getenv("PSGC_MAX_RETRIES", "2"))
        self.psgc_cache_ttl_ms: int = int(os.getenv("PSGC_CACHE_TTL_MS", "86400000"))

        # External API #2 — Nager.Date Philippine Public Holidays API
        self.holiday_api_base_url: str = os.getenv("HOLIDAY_API_BASE_URL", "https://date.nager.at/api/v3").strip().rstrip("/")
        self.holiday_country_code: str = os.getenv("HOLIDAY_COUNTRY_CODE", "PH").strip().upper()
        self.holiday_timeout_ms: int = int(os.getenv("HOLIDAY_TIMEOUT_MS", "8000"))
        self.holiday_max_retries: int = int(os.getenv("HOLIDAY_MAX_RETRIES", "2"))
        self.holiday_cache_ttl_ms: int = int(os.getenv("HOLIDAY_CACHE_TTL_MS", "86400000"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
