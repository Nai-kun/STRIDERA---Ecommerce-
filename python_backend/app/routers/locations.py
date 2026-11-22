"""Philippine PSGC Address API proxy and server-side validation routes (/api/locations/*)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from ..services import psgc_client

router = APIRouter(prefix="/api/locations", tags=["Locations (PSGC API)"])


def _psgc_error_response(exc: psgc_client.PsgcError) -> JSONResponse:
    status_code = exc.status_code or 503
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "code": exc.code or "PSGC_ERROR",
            "message": str(exc),
            "degraded": status_code >= 500,
        },
    )


@router.get("/health")
async def get_psgc_health(refresh: str | None = None):
    health = await psgc_client.check_health(force_refresh=(refresh == "true"))
    return JSONResponse(
        status_code=200 if health["reachable"] else 503,
        content={"success": health["reachable"], "data": health},
    )


@router.get("/regions")
async def list_regions():
    try:
        res = await psgc_client.get_regions()
        return {"success": True, "data": res}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)


@router.get("/regions/{region_code}/provinces")
async def list_provinces(region_code: str):
    try:
        res = await psgc_client.get_provinces_by_region(region_code)
        return {"success": True, "data": res}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)


@router.get("/regions/{region_code}/cities")
async def list_cities_by_region(region_code: str):
    try:
        res = await psgc_client.get_cities_by_region(region_code)
        return {"success": True, "data": res}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)


@router.get("/provinces/{province_code}/cities")
async def list_cities_by_province(province_code: str):
    try:
        res = await psgc_client.get_cities_by_province(province_code)
        return {"success": True, "data": res}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)


@router.get("/cities/{city_code}/barangays")
async def list_barangays(city_code: str):
    try:
        res = await psgc_client.get_barangays_by_city(city_code)
        return {"success": True, "data": res}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)


@router.post("/validate-address")
async def validate_address(payload: dict[str, Any] = Body(default_factory=dict)):
    try:
        verified = await psgc_client.validate_address_hierarchy(
            region_code=payload.get("regionCode"),
            province_code=payload.get("provinceCode"),
            city_code=payload.get("cityCode"),
            barangay_code=payload.get("barangayCode"),
        )
        return {"success": True, "data": verified}
    except psgc_client.PsgcError as exc:
        return _psgc_error_response(exc)
