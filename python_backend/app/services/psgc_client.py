"""Dedicated PSGC Philippine Address API Service Layer (Server-Side Only).

Upstream: https://psgc.gitlab.io/api (PSA Philippine Standard Geographic Code JSON endpoints)
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("stridera.psgc")

DEFAULT_PSGC_BASE_URL = "https://psgc.gitlab.io/api"
DEFAULT_TIMEOUT_MS = 8000
DEFAULT_MAX_RETRIES = 2
DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
PSGC_CODE_RE = re.compile(r"^\d{9}$")


class PsgcError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "PSGC_ERROR",
        status_code: int = 502,
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


def clear_cache() -> None:
    global _cache_hits, _cache_misses
    _cache.clear()
    _cache_hits = 0
    _cache_misses = 0


def get_cache_stats() -> dict[str, int]:
    return {"entries": len(_cache), "hits": _cache_hits, "misses": _cache_misses}


def get_config(env: dict[str, str] | None = None) -> dict[str, Any]:
    source = env if env is not None else os.environ
    raw_base = str(source.get("PSGC_API_BASE_URL") or DEFAULT_PSGC_BASE_URL).strip().rstrip("/")
    parsed = urlparse(raw_base)
    if not parsed.scheme or not parsed.netloc:
        raise PsgcError("PSGC_API_BASE_URL is not a valid URL.", code="PSGC_INVALID_CONFIG", status_code=500)
    if parsed.scheme.lower() != "https":
        raise PsgcError("PSGC_API_BASE_URL must use HTTPS.", code="PSGC_INVALID_CONFIG", status_code=500)

    def _int_env(name: str, default_val: int) -> int:
        try:
            val = int(source.get(name, default_val))
            return val
        except (TypeError, ValueError):
            return default_val

    timeout_ms = _int_env("PSGC_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
    max_retries = _int_env("PSGC_MAX_RETRIES", DEFAULT_MAX_RETRIES)
    cache_ttl_ms = _int_env("PSGC_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS)

    return {
        "baseUrl": raw_base,
        "host": parsed.netloc,
        "timeoutMs": timeout_ms if timeout_ms > 0 else DEFAULT_TIMEOUT_MS,
        "maxRetries": min(max_retries, 4) if max_retries >= 0 else DEFAULT_MAX_RETRIES,
        "cacheTtlMs": cache_ttl_ms if cache_ttl_ms >= 0 else DEFAULT_CACHE_TTL_MS,
    }


def validate_psgc_code(raw_code: Any, field_name: str = "code") -> str:
    code = str(raw_code or "").strip()
    if not PSGC_CODE_RE.match(code):
        raise PsgcError(
            f"Invalid PSGC {field_name}: expected a 9-digit numeric code.",
            code="PSGC_INVALID_CODE",
            status_code=400,
        )
    return code


def _opt_str(val: Any) -> str | None:
    if isinstance(val, str):
        stripped = val.strip()
        return stripped if stripped else None
    return None


def _retry_delay_sec(attempt: int, retry_after_header: str | None, base_ms: int = 250) -> float:
    if retry_after_header:
        try:
            secs = int(retry_after_header)
            if secs >= 0:
                return min(secs, 3)
        except ValueError:
            pass
    return min((base_ms * (2**attempt)) / 1000.0, 2.0)


async def request_psgc(
    endpoint_path: str,
    *,
    bypass_cache: bool = False,
    timeout_ms: int | None = None,
    max_retries: int | None = None,
    retry_base_delay_ms: int = 250,
    env: dict[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    global _cache_hits, _cache_misses
    cfg = get_config(env)
    normalized_path = endpoint_path if endpoint_path.startswith("/") else f"/{endpoint_path}"
    full_url = f"{cfg['baseUrl']}{normalized_path}"
    now_ms = int(time.time() * 1000)

    if not bypass_cache and cfg["cacheTtlMs"] > 0:
        cached = _cache.get(full_url)
        if cached and now_ms < cached["expiresAt"]:
            _cache_hits += 1
            return {
                "data": cached["data"],
                "fromCache": True,
                "httpStatus": cached["httpStatus"],
                "latencyMs": 0,
                "host": cfg["host"],
            }
        if cached and now_ms >= cached["expiresAt"]:
            _cache.pop(full_url, None)

    _cache_misses += 1
    eff_timeout_sec = (timeout_ms if timeout_ms and timeout_ms > 0 else cfg["timeoutMs"]) / 1000.0
    eff_retries = min(max_retries, 4) if (max_retries is not None and max_retries >= 0) else cfg["maxRetries"]
    max_attempts = eff_retries + 1

    last_error: PsgcError | None = None
    client_kwargs: dict[str, Any] = {"timeout": eff_timeout_sec, "follow_redirects": True}
    if transport is not None:
        client_kwargs["transport"] = transport

    async with httpx.AsyncClient(**client_kwargs) as client:
        for attempt in range(max_attempts):
            t0 = time.monotonic()
            try:
                res = await client.get(
                    full_url,
                    headers={"Accept": "application/json", "User-Agent": "STRIDERA-Ecommerce/2.0 (FastAPI)"},
                )
                elapsed_ms = int((time.monotonic() - t0) * 1000)
                logger.info("[PSGC] GET %s%s -> HTTP %s (%sms) [cache:miss]", cfg["host"], normalized_path, res.status_code, elapsed_ms)

                if 200 <= res.status_code < 300:
                    try:
                        payload = res.json()
                    except ValueError as exc:
                        raise PsgcError(
                            "PSGC API returned an invalid or non-JSON response payload.",
                            code="PSGC_INVALID_RESPONSE",
                            status_code=502,
                            http_status=res.status_code,
                            details={"contentType": res.headers.get("content-type", "")},
                        ) from exc

                    if not isinstance(payload, (list, dict)):
                        raise PsgcError(
                            "PSGC API returned an invalid or non-JSON response payload.",
                            code="PSGC_INVALID_RESPONSE",
                            status_code=502,
                            http_status=res.status_code,
                        )

                    if not bypass_cache and cfg["cacheTtlMs"] > 0:
                        _cache[full_url] = {
                            "data": payload,
                            "httpStatus": res.status_code,
                            "expiresAt": int(time.time() * 1000) + cfg["cacheTtlMs"],
                        }

                    return {
                        "data": payload,
                        "fromCache": False,
                        "httpStatus": res.status_code,
                        "latencyMs": elapsed_ms,
                        "host": cfg["host"],
                    }

                if res.status_code == 404:
                    raise PsgcError(
                        "Requested Philippine geographic record was not found in PSGC.",
                        code="PSGC_NOT_FOUND",
                        status_code=404,
                        http_status=404,
                    )

                if res.status_code == 429:
                    last_error = PsgcError(
                        "PSGC API rate limit exceeded. Please try again shortly or use manual entry.",
                        code="PSGC_RATE_LIMITED",
                        status_code=429,
                        http_status=429,
                        retryable=True,
                    )
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(_retry_delay_sec(attempt, res.headers.get("retry-after"), retry_base_delay_ms))
                        continue
                    raise last_error

                if res.status_code in RETRYABLE_HTTP_STATUSES or res.status_code >= 500:
                    last_error = PsgcError(
                        "PSGC Philippine Address API is temporarily unavailable.",
                        code="PSGC_UNAVAILABLE",
                        status_code=503,
                        http_status=res.status_code,
                        retryable=True,
                    )
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(_retry_delay_sec(attempt, None, retry_base_delay_ms))
                        continue
                    raise last_error

                raise PsgcError(
                    f"PSGC API returned unexpected status HTTP {res.status_code}.",
                    code="PSGC_ERROR",
                    status_code=502,
                    http_status=res.status_code,
                )

            except PsgcError:
                raise
            except httpx.TimeoutException as exc:
                last_error = PsgcError(
                    "PSGC Philippine Address API timed out. You can switch to manual entry.",
                    code="PSGC_TIMEOUT",
                    status_code=504,
                    retryable=True,
                    details=str(exc),
                )
            except httpx.RequestError as exc:
                last_error = PsgcError(
                    "Unable to reach PSGC Philippine Address API.",
                    code="PSGC_UNAVAILABLE",
                    status_code=503,
                    retryable=True,
                    details=str(exc),
                )

            if attempt < max_attempts - 1:
                await asyncio.sleep(_retry_delay_sec(attempt, None, retry_base_delay_ms))
                continue
            assert last_error is not None
            raise last_error

    raise last_error or PsgcError("PSGC API request failed.", code="PSGC_UNAVAILABLE", status_code=503)


def _format_region(r: dict[str, Any]) -> dict[str, Any]:
    name = str(r.get("name") or "").strip()
    region_name = str(r.get("regionName") or name).strip()
    display_name = f"{region_name} ({name})" if (name and region_name and name != region_name) else (region_name or name)
    return {
        "code": str(r.get("code")),
        "name": name,
        "regionName": region_name,
        "displayName": display_name,
        "islandGroupCode": _opt_str(r.get("islandGroupCode")),
    }


def _format_province(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(p.get("code")),
        "name": str(p.get("name") or "").strip(),
        "regionCode": _opt_str(p.get("regionCode")),
    }


def _format_city(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(c.get("code")),
        "name": str(c.get("name") or "").strip(),
        "isCity": bool(c.get("isCity")),
        "isMunicipality": bool(c.get("isMunicipality")),
        "provinceCode": _opt_str(c.get("provinceCode")),
        "regionCode": _opt_str(c.get("regionCode")),
    }


def _format_barangay(b: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(b.get("code")),
        "name": str(b.get("name") or "").strip(),
        "cityCode": _opt_str(b.get("cityCode")) or _opt_str(b.get("municipalityCode")),
        "provinceCode": _opt_str(b.get("provinceCode")),
        "regionCode": _opt_str(b.get("regionCode")),
    }


async def get_regions(**kwargs: Any) -> dict[str, Any]:
    res = await request_psgc("/regions.json", **kwargs)
    if not isinstance(res["data"], list):
        raise PsgcError("Unexpected PSGC regions format.", code="PSGC_INVALID_RESPONSE", status_code=502)
    regions = sorted([_format_region(r) for r in res["data"]], key=lambda x: x["code"])
    return {"regions": regions, "fromCache": res["fromCache"], "latencyMs": res["latencyMs"]}


async def get_provinces_by_region(raw_region_code: str, **kwargs: Any) -> dict[str, Any]:
    region_code = validate_psgc_code(raw_region_code, "regionCode")
    res = await request_psgc(f"/regions/{region_code}/provinces.json", **kwargs)
    if not isinstance(res["data"], list):
        raise PsgcError("Unexpected PSGC provinces format.", code="PSGC_INVALID_RESPONSE", status_code=502)
    provinces = sorted([_format_province(p) for p in res["data"]], key=lambda x: x["name"])
    return {
        "regionCode": region_code,
        "hasProvinces": len(provinces) > 0,
        "provinces": provinces,
        "fromCache": res["fromCache"],
        "latencyMs": res["latencyMs"],
    }


async def get_cities_by_region(raw_region_code: str, **kwargs: Any) -> dict[str, Any]:
    region_code = validate_psgc_code(raw_region_code, "regionCode")
    res = await request_psgc(f"/regions/{region_code}/cities-municipalities.json", **kwargs)
    if not isinstance(res["data"], list):
        raise PsgcError("Unexpected PSGC cities format.", code="PSGC_INVALID_RESPONSE", status_code=502)
    cities = sorted([_format_city(c) for c in res["data"]], key=lambda x: x["name"])
    return {"regionCode": region_code, "cities": cities, "fromCache": res["fromCache"], "latencyMs": res["latencyMs"]}


async def get_cities_by_province(raw_province_code: str, **kwargs: Any) -> dict[str, Any]:
    province_code = validate_psgc_code(raw_province_code, "provinceCode")
    res = await request_psgc(f"/provinces/{province_code}/cities-municipalities.json", **kwargs)
    if not isinstance(res["data"], list):
        raise PsgcError("Unexpected PSGC cities format.", code="PSGC_INVALID_RESPONSE", status_code=502)
    cities = sorted([_format_city(c) for c in res["data"]], key=lambda x: x["name"])
    return {"provinceCode": province_code, "cities": cities, "fromCache": res["fromCache"], "latencyMs": res["latencyMs"]}


async def get_barangays_by_city(raw_city_code: str, **kwargs: Any) -> dict[str, Any]:
    city_code = validate_psgc_code(raw_city_code, "cityCode")
    res = await request_psgc(f"/cities-municipalities/{city_code}/barangays.json", **kwargs)
    if not isinstance(res["data"], list):
        raise PsgcError("Unexpected PSGC barangays format.", code="PSGC_INVALID_RESPONSE", status_code=502)
    barangays = sorted([_format_barangay(b) for b in res["data"]], key=lambda x: x["name"])
    return {"cityCode": city_code, "barangays": barangays, "fromCache": res["fromCache"], "latencyMs": res["latencyMs"]}


async def validate_address_hierarchy(
    *,
    region_code: str | None = None,
    province_code: str | None = None,
    city_code: str | None = None,
    barangay_code: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    clean_region = validate_psgc_code(region_code, "regionCode")
    clean_city = validate_psgc_code(city_code, "cityCode")
    clean_province = validate_psgc_code(province_code, "provinceCode") if province_code else None
    clean_barangay = validate_psgc_code(barangay_code, "barangayCode") if barangay_code else None

    reg_res = await get_regions(**kwargs)
    region = next((r for r in reg_res["regions"] if r["code"] == clean_region), None)
    if not region:
        raise PsgcError("Selected PSGC region code does not exist.", code="PSGC_ADDRESS_MISMATCH", status_code=400)

    prov_res = await get_provinces_by_region(clean_region, **kwargs)
    matched_province = None
    matched_city = None

    if prov_res["hasProvinces"]:
        if not clean_province:
            raise PsgcError("Province selection is required for this Philippine region.", code="PSGC_ADDRESS_MISMATCH", status_code=400)
        matched_province = next((p for p in prov_res["provinces"] if p["code"] == clean_province), None)
        if not matched_province:
            raise PsgcError("Selected province does not belong to the selected region.", code="PSGC_ADDRESS_MISMATCH", status_code=400)

        prov_cities = (await get_cities_by_province(clean_province, **kwargs))["cities"]
        matched_city = next((c for c in prov_cities if c["code"] == clean_city), None)
        if not matched_city:
            reg_cities = (await get_cities_by_region(clean_region, **kwargs))["cities"]
            matched_city = next((c for c in reg_cities if c["code"] == clean_city and not c.get("provinceCode")), None)

        if not matched_city:
            raise PsgcError("Selected city/municipality does not belong to the selected province.", code="PSGC_ADDRESS_MISMATCH", status_code=400)
    else:
        if clean_province:
            raise PsgcError("Selected region (such as NCR) does not use a province code.", code="PSGC_ADDRESS_MISMATCH", status_code=400)
        reg_cities = (await get_cities_by_region(clean_region, **kwargs))["cities"]
        matched_city = next((c for c in reg_cities if c["code"] == clean_city), None)
        if not matched_city:
            raise PsgcError("Selected city/municipality does not belong to the selected region.", code="PSGC_ADDRESS_MISMATCH", status_code=400)

    matched_barangay = None
    if clean_barangay:
        bgy_list = (await get_barangays_by_city(clean_city, **kwargs))["barangays"]
        matched_barangay = next((b for b in bgy_list if b["code"] == clean_barangay), None)
        if not matched_barangay:
            raise PsgcError("Selected barangay does not belong to the selected city/municipality.", code="PSGC_ADDRESS_MISMATCH", status_code=400)

    canonical_province = (
        matched_province["name"]
        if matched_province
        else ("Metro Manila" if clean_region == "130000000" else region["regionName"])
    )

    return {
        "verified": True,
        "source": "PSGC_VERIFIED",
        "regionCode": region["code"],
        "regionName": region["displayName"],
        "provinceCode": matched_province["code"] if matched_province else None,
        "provinceName": canonical_province,
        "cityCode": matched_city["code"],
        "cityName": matched_city["name"],
        "barangayCode": matched_barangay["code"] if matched_barangay else None,
        "barangayName": matched_barangay["name"] if matched_barangay else None,
    }


async def check_health(*, force_refresh: bool = True, **kwargs: Any) -> dict[str, Any]:
    cfg = get_config(kwargs.get("env"))
    t0 = time.monotonic()
    checked_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        res = await request_psgc(
            "/regions.json",
            bypass_cache=force_refresh,
            timeout_ms=kwargs.get("timeout_ms") or 5000,
            max_retries=kwargs.get("max_retries") if kwargs.get("max_retries") is not None else 0,
            transport=kwargs.get("transport"),
            env=kwargs.get("env"),
        )
        regions = res["data"] if isinstance(res["data"], list) else []
        return {
            "provider": "psgc",
            "host": cfg["host"],
            "reachable": len(regions) > 0,
            "httpStatus": res.get("httpStatus") or 200,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "regionCount": len(regions),
            "cache": get_cache_stats(),
            "checkedAt": checked_at,
            "message": f"PSGC Philippine Address API reachable ({len(regions)} regions).",
        }
    except Exception as exc:
        return {
            "provider": "psgc",
            "host": cfg["host"],
            "reachable": False,
            "httpStatus": getattr(exc, "http_status", None),
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "regionCount": 0,
            "cache": get_cache_stats(),
            "checkedAt": checked_at,
            "message": str(exc) or "PSGC Philippine Address API unreachable.",
        }
