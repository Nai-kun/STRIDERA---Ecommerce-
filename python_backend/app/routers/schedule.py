"""Holiday-Aware Philippine Delivery Schedule API routes (/api/schedule/*)."""

from __future__ import annotations

import re

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..services import holiday_client

router = APIRouter(prefix="/api/schedule", tags=["Schedule (Holiday API)"])
PSGC_CODE_RE = re.compile(r"^\d{9}$")


def _holiday_error_response(exc: holiday_client.HolidayApiError, *, include_degraded: bool = False) -> JSONResponse:
    status_code = exc.status_code or 503
    body: dict[str, object] = {
        "success": False,
        "code": exc.code or "HOLIDAY_API_ERROR",
        "message": str(exc),
    }
    if include_degraded:
        body["degraded"] = status_code >= 500
    return JSONResponse(status_code=status_code, content=body)


@router.get("/health")
async def get_holiday_health(refresh: str | None = None):
    health = await holiday_client.check_health(force_refresh=(refresh == "true"))
    return JSONResponse(
        status_code=200 if health["reachable"] else 503,
        content={"success": health["reachable"], "data": health},
    )


@router.get("/holidays")
async def get_public_holidays(year: str | None = None):
    try:
        today_manila = holiday_client.get_manila_today_iso()
        target_year = year if year is not None else int(today_manila[:4])
        holidays = await holiday_client.get_public_holidays(target_year)
        resolved_year = holiday_client.validate_year(target_year)
        upcoming = [h for h in holidays if h["date"] >= today_manila][:5]
        return {
            "success": True,
            "data": {
                "year": resolved_year,
                "countryCode": holiday_client.get_config()["countryCode"],
                "count": len(holidays),
                "today": today_manila,
                "upcoming": upcoming,
                "holidays": holidays,
                "cache": holiday_client.get_cache_stats(),
            },
        }
    except holiday_client.HolidayApiError as exc:
        return _holiday_error_response(exc, include_degraded=True)


@router.get("/delivery-estimate")
async def get_delivery_estimate(
    regionCode: str = "",
    province: str = "",
    city: str = "",
    fromDate: str | None = None,
):
    try:
        clean_region = regionCode.strip()
        if clean_region and not PSGC_CODE_RE.match(clean_region):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid regionCode: expected 9 digits."},
            )
        estimate = await holiday_client.calculate_delivery_estimate(
            region_code=clean_region,
            province=province.strip()[:100],
            city=city.strip()[:100],
            from_date=fromDate.strip() if fromDate else None,
        )
        return {"success": True, "data": estimate}
    except holiday_client.HolidayApiError as exc:
        return _holiday_error_response(exc)
