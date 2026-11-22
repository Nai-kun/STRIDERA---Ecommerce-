"""Dedicated Nager.Date Public Holidays API Service Layer (Server-Side Only).

Upstream: https://date.nager.at/api/v3 (PublicHolidays/{year}/{countryCode} — free, no API key required)
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("stridera.holiday")

DEFAULT_HOLIDAY_BASE_URL = "https://date.nager.at/api/v3"
DEFAULT_COUNTRY_CODE = "PH"
DEFAULT_TIMEOUT_MS = 8000
DEFAULT_MAX_RETRIES = 2
DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
HEALTH_CACHE_TTL_MS = 30 * 1000
RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
MANILA_TZ = timezone(timedelta(hours=8))

NCR_CITY_RE = re.compile(
    r"^(city of )?(manila|makati|quezon city|taguig|pasig|mandaluyong|marikina|pasay|paranaque|para[ñn]aque|las pinas|las pi[ñn]as|muntinlupa|caloocan|malabon|navotas|valenzuela|san juan|pateros)$",
    re.IGNORECASE,
)
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")


class HolidayApiError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "HOLIDAY_API_ERROR",
        status_code: int = 503,
        http_status: int | None = None,
        retryable: bool = False,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.http_status = http_status
        self.retryable = retryable
        self.details = details


_cache: dict[str, dict[str, Any]] = {}
_cache_hits = 0
_cache_misses = 0
_health_cache: dict[str, Any] | None = None


def clear_cache() -> None:
    global _cache_hits, _cache_misses, _health_cache
    _cache.clear()
    _cache_hits = 0
    _cache_misses = 0
    _health_cache = None


def get_cache_stats() -> dict[str, int]:
    return {"entries": len(_cache), "hits": _cache_hits, "misses": _cache_misses}


def get_config(env: dict[str, str] | None = None) -> dict[str, Any]:
    source = env if env is not None else os.environ
    raw_base = str(source.get("HOLIDAY_API_BASE_URL") or DEFAULT_HOLIDAY_BASE_URL).strip().rstrip("/")
    parsed = urlparse(raw_base)
    if not parsed.scheme or not parsed.netloc:
        raise HolidayApiError("HOLIDAY_API_BASE_URL is not a valid URL.", code="HOLIDAY_INVALID_CONFIG", status_code=500)
    if parsed.scheme.lower() != "https":
        raise HolidayApiError("HOLIDAY_API_BASE_URL must use HTTPS.", code="HOLIDAY_INVALID_CONFIG", status_code=500)

    country_code = str(source.get("HOLIDAY_COUNTRY_CODE") or DEFAULT_COUNTRY_CODE).strip().upper()
    if not COUNTRY_RE.match(country_code):
        raise HolidayApiError("HOLIDAY_COUNTRY_CODE must be a 2-letter ISO country code.", code="HOLIDAY_INVALID_CONFIG", status_code=500)

    def _int_env(name: str, default_val: int) -> int:
        try:
            return int(source.get(name, default_val))
        except (TypeError, ValueError):
            return default_val

    timeout_ms = _int_env("HOLIDAY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
    max_retries = _int_env("HOLIDAY_MAX_RETRIES", DEFAULT_MAX_RETRIES)
    cache_ttl_ms = _int_env("HOLIDAY_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS)

    return {
        "baseUrl": raw_base,
        "host": parsed.netloc,
        "countryCode": country_code,
        "timeoutMs": timeout_ms if timeout_ms > 0 else DEFAULT_TIMEOUT_MS,
        "maxRetries": min(max_retries, 4) if max_retries >= 0 else DEFAULT_MAX_RETRIES,
        "cacheTtlMs": cache_ttl_ms if cache_ttl_ms >= 0 else DEFAULT_CACHE_TTL_MS,
    }


def validate_year(raw_year: Any) -> int:
    try:
        year = raw_year if isinstance(raw_year, int) and not isinstance(raw_year, bool) else int(str(raw_year or "").strip())
    except (TypeError, ValueError) as exc:
        raise HolidayApiError("Year must be a 4-digit integer between 2000 and 2100.", code="HOLIDAY_INVALID_YEAR", status_code=400) from exc
    if year < 2000 or year > 2100:
        raise HolidayApiError("Year must be a 4-digit integer between 2000 and 2100.", code="HOLIDAY_INVALID_YEAR", status_code=400)
    return year


def get_manila_today_iso(now_ms: int | None = None) -> str:
    ts = (now_ms / 1000.0) if now_ms is not None else time.time()
    return datetime.fromtimestamp(ts, tz=MANILA_TZ).date().isoformat()


def normalize_start_date_iso(from_date: str | date | datetime | None = None, now_ms: int | None = None) -> str:
    if from_date is None or (isinstance(from_date, str) and not from_date.strip()):
        return get_manila_today_iso(now_ms)
    if isinstance(from_date, datetime):
        return from_date.astimezone(MANILA_TZ).date().isoformat()
    if isinstance(from_date, date):
        return from_date.isoformat()
    clean = str(from_date).strip()
    if not ISO_DATE_RE.match(clean):
        raise HolidayApiError("fromDate must use YYYY-MM-DD format.", code="HOLIDAY_INVALID_DATE", status_code=400)
    try:
        date.fromisoformat(clean)
    except ValueError as exc:
        raise HolidayApiError("fromDate is not a valid calendar date.", code="HOLIDAY_INVALID_DATE", status_code=400) from exc
    return clean


def _retry_delay_sec(attempt: int, retry_after_header: str | None, base_ms: int = 250) -> float:
    if retry_after_header:
        try:
            secs = int(retry_after_header)
            if secs >= 0:
                return min(secs, 3)
        except ValueError:
            pass
    return min((base_ms * (2**attempt)) / 1000.0, 2.0)


async def get_public_holidays(
    raw_year: Any = None,
    *,
    bypass_cache: bool = False,
    retry_base_delay_ms: int = 250,
    env: dict[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    now_ms: int | None = None,
) -> list[dict[str, Any]]:
    global _cache_hits, _cache_misses
    cfg = get_config(env)
    default_year = int(get_manila_today_iso(now_ms)[:4])
    year = validate_year(raw_year if raw_year is not None else default_year)
    country_code = cfg["countryCode"]

    endpoint_path = f"/PublicHolidays/{year}/{country_code}"
    full_url = f"{cfg['baseUrl']}{endpoint_path}"
    cur_ms = now_ms if now_ms is not None else int(time.time() * 1000)

    if not bypass_cache and cfg["cacheTtlMs"] > 0:
        cached = _cache.get(full_url)
        if cached and cur_ms < cached["expiresAt"]:
            _cache_hits += 1
            return cached["data"]
    _cache_misses += 1

    last_error: HolidayApiError | None = None
    client_kwargs: dict[str, Any] = {"timeout": cfg["timeoutMs"] / 1000.0, "follow_redirects": True}
    if transport is not None:
        client_kwargs["transport"] = transport

    async with httpx.AsyncClient(**client_kwargs) as client:
        for attempt in range(cfg["maxRetries"] + 1):
            t0 = time.monotonic()
            try:
                response = await client.get(
                    full_url,
                    headers={"Accept": "application/json", "User-Agent": "STRIDERA-Ecommerce/2.0 (FastAPI)"},
                )
                latency_ms = int((time.monotonic() - t0) * 1000)
                logger.info("[HolidayAPI] GET %s%s -> HTTP %s (%sms) [cache:miss]", cfg["host"], endpoint_path, response.status_code, latency_ms)

                if not (200 <= response.status_code < 300):
                    retryable = response.status_code in RETRYABLE_HTTP_STATUSES
                    err = HolidayApiError(
                        f"Public holiday service is temporarily busy (HTTP {response.status_code})."
                        if retryable
                        else f"Public holiday service rejected request (HTTP {response.status_code}).",
                        code="HOLIDAY_UPSTREAM_RETRYABLE" if retryable else "HOLIDAY_UPSTREAM_ERROR",
                        status_code=503 if retryable else 502,
                        http_status=response.status_code,
                        retryable=retryable,
                    )
                    if retryable and attempt < cfg["maxRetries"]:
                        last_error = err
                        await asyncio.sleep(_retry_delay_sec(attempt, response.headers.get("retry-after"), retry_base_delay_ms))
                        continue
                    raise err

                try:
                    payload = response.json()
                except ValueError as exc:
                    raise HolidayApiError(
                        "Public holiday service returned malformed JSON.",
                        code="HOLIDAY_BAD_JSON",
                        status_code=502,
                        http_status=response.status_code,
                    ) from exc

                if not isinstance(payload, list):
                    raise HolidayApiError(
                        "Unexpected response structure from public holiday service.",
                        code="HOLIDAY_BAD_PAYLOAD",
                        status_code=502,
                        http_status=response.status_code,
                    )

                normalized: list[dict[str, Any]] = []
                for item in payload:
                    if not isinstance(item, dict):
                        continue
                    h_date = str(item.get("date") or "").strip()
                    h_name = str(item.get("name") or "").strip()
                    if not ISO_DATE_RE.match(h_date) or not h_name:
                        raise HolidayApiError(
                            "Public holiday record failed server-side validation.",
                            code="HOLIDAY_BAD_RECORD",
                            status_code=502,
                            http_status=response.status_code,
                        )
                    normalized.append({
                        "date": h_date,
                        "name": h_name,
                        "localName": str(item.get("localName") or h_name).strip(),
                        "countryCode": str(item.get("countryCode") or country_code).strip().upper(),
                        "types": [str(t) for t in item.get("types", [])] if isinstance(item.get("types"), list) else [],
                    })

                normalized.sort(key=lambda x: x["date"])

                if cfg["cacheTtlMs"] > 0:
                    _cache[full_url] = {"data": normalized, "expiresAt": cur_ms + cfg["cacheTtlMs"]}

                return normalized

            except HolidayApiError as exc:
                last_error = exc
                if not exc.retryable or attempt >= cfg["maxRetries"]:
                    raise
                continue
            except httpx.TimeoutException as exc:
                last_error = HolidayApiError(
                    "Public holiday service timed out before responding.",
                    code="HOLIDAY_TIMEOUT",
                    status_code=503,
                    retryable=True,
                    details=str(exc),
                )
            except httpx.RequestError as exc:
                last_error = HolidayApiError(
                    "Unable to reach public holiday service over HTTPS.",
                    code="HOLIDAY_NETWORK_ERROR",
                    status_code=503,
                    retryable=True,
                    details=str(exc),
                )

            if attempt < cfg["maxRetries"]:
                await asyncio.sleep(_retry_delay_sec(attempt, None, retry_base_delay_ms))
                continue
            assert last_error is not None
            raise last_error

    raise last_error or HolidayApiError("Public holiday service failed.")


def classify_philippines_zone(*, region_code: str = "", province: str = "", city: str = "") -> dict[str, Any]:
    clean_region = str(region_code or "").strip()
    clean_province = str(province or "").strip()
    clean_city = str(city or "").strip()

    is_ncr = (
        clean_region == "130000000"
        or bool(re.search(r"metro\s*manila|\bncr\b|national\s*capital", clean_province, re.IGNORECASE))
        or bool(NCR_CITY_RE.match(clean_city))
    )

    if is_ncr:
        return {"zone": "NCR", "zoneLabel": "Metro Manila (NCR)", "minBusinessDays": 2, "maxBusinessDays": 3}
    return {"zone": "PROVINCIAL", "zoneLabel": "Provincial Philippines", "minBusinessDays": 4, "maxBusinessDays": 6}


def advance_business_days(start_date_iso: str, business_days_needed: int, holiday_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    cursor = date.fromisoformat(start_date_iso)
    counted = 0
    skipped_holidays: list[dict[str, Any]] = []
    seen_dates: set[str] = set()
    guard = 0

    while counted < business_days_needed and guard < 60:
        guard += 1
        cursor += timedelta(days=1)
        cursor_iso = cursor.isoformat()
        holiday = holiday_map.get(cursor_iso)
        if holiday and cursor_iso not in seen_dates:
            seen_dates.add(cursor_iso)
            skipped_holidays.append({
                "date": holiday["date"],
                "name": holiday["name"],
                "localName": holiday["localName"],
            })
        # Sunday in Python weekday() is 6
        if cursor.weekday() == 6 or holiday:
            continue
        counted += 1

    return {"targetDate": cursor.isoformat(), "skippedHolidays": skipped_holidays}


async def calculate_delivery_estimate(
    *,
    region_code: str = "",
    province: str = "",
    city: str = "",
    from_date: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    now_ms = kwargs.get("now_ms")
    start_date_iso = normalize_start_date_iso(from_date, now_ms)
    start_year = int(start_date_iso[:4])
    start_month = int(start_date_iso[5:7])
    zone_info = classify_philippines_zone(region_code=region_code, province=province, city=city)

    holiday_map: dict[str, dict[str, Any]] = {}
    all_holidays: list[dict[str, Any]] = []
    degraded = False

    try:
        years = [start_year, start_year + 1] if start_month == 12 else [start_year]
        lists = await asyncio.gather(*[get_public_holidays(yr, **kwargs) for yr in years])
        for h_list in lists:
            for h in h_list:
                all_holidays.append(h)
                holiday_map.setdefault(h["date"], h)
    except Exception:
        degraded = True

    start_res = advance_business_days(start_date_iso, zone_info["minBusinessDays"], holiday_map)
    end_res = advance_business_days(start_date_iso, zone_info["maxBusinessDays"], holiday_map)

    holidays_in_window = [] if degraded else list(end_res["skippedHolidays"])
    upcoming_holidays = (
        []
        if degraded
        else [
            {"date": h["date"], "name": h["name"], "localName": h["localName"]}
            for h in all_holidays
            if h["date"] >= start_date_iso
        ][:3]
    )

    if degraded:
        notice = "Holiday calendar service is currently unavailable; estimate excludes Sundays only."
    elif holidays_in_window:
        plural = "s" if len(holidays_in_window) > 1 else ""
        joined = ", ".join(f"{h['name']} ({h['date']})" for h in holidays_in_window)
        notice = f"Window adjusted for official PH holiday{plural}: {joined}."
    else:
        notice = None

    return {
        "zone": zone_info["zone"],
        "zoneLabel": zone_info["zoneLabel"],
        "minBusinessDays": zone_info["minBusinessDays"],
        "maxBusinessDays": zone_info["maxBusinessDays"],
        "orderDate": start_date_iso,
        "estimatedDeliveryStart": start_res["targetDate"],
        "estimatedDeliveryEnd": end_res["targetDate"],
        "source": "FALLBACK_NO_HOLIDAY_DATA" if degraded else "NAGER_PH_HOLIDAYS",
        "degraded": degraded,
        "holidaysInWindow": holidays_in_window,
        "upcomingHolidays": upcoming_holidays,
        "notice": notice,
    }


async def check_health(*, force_refresh: bool = False, **kwargs: Any) -> dict[str, Any]:
    global _health_cache
    now_ms = kwargs.get("now_ms") if kwargs.get("now_ms") is not None else int(time.time() * 1000)
    if not force_refresh and _health_cache and (now_ms - _health_cache["checkedAtMs"] < HEALTH_CACHE_TTL_MS):
        return {**_health_cache["data"], "cache": get_cache_stats()}

    checked_at = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        cfg = get_config(kwargs.get("env"))
    except Exception as exc:
        return {
            "reachable": False,
            "httpStatus": None,
            "latencyMs": 0,
            "host": None,
            "countryCode": DEFAULT_COUNTRY_CODE,
            "year": None,
            "error": str(exc),
            "checkedAt": checked_at,
            "cache": get_cache_stats(),
        }

    year = int(get_manila_today_iso(now_ms)[:4])
    t0 = time.monotonic()
    try:
        holidays = await get_public_holidays(year, bypass_cache=force_refresh, **kwargs)
        data = {
            "reachable": True,
            "httpStatus": 200,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "host": cfg["host"],
            "countryCode": cfg["countryCode"],
            "year": year,
            "holidayCount": len(holidays),
            "checkedAt": checked_at,
            "cache": get_cache_stats(),
        }
        _health_cache = {"checkedAtMs": now_ms, "data": data}
        return data
    except Exception as exc:
        data = {
            "reachable": False,
            "httpStatus": getattr(exc, "http_status", None),
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "host": cfg["host"],
            "countryCode": cfg["countryCode"],
            "year": year,
            "holidayCount": 0,
            "error": str(exc),
            "checkedAt": checked_at,
            "cache": get_cache_stats(),
        }
        _health_cache = {"checkedAtMs": now_ms, "data": data}
        return data
