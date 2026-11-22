"""Tests for PSGC Philippine Address API & Nager.Date Public Holidays API services (mocked + live HTTP)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from python_backend.app.services import holiday_client, psgc_client


@pytest.fixture(autouse=True)
def _reset_api_caches():
    psgc_client.clear_cache()
    holiday_client.clear_cache()
    yield
    psgc_client.clear_cache()
    holiday_client.clear_cache()


def _mock_transport(handler):
    return httpx.MockTransport(handler)


def test_psgc_hierarchy_validation_ncr_and_provincial() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/regions.json"):
            return httpx.Response(200, json=[
                {"code": "130000000", "name": "NCR", "regionName": "National Capital Region"},
                {"code": "040000000", "name": "Region IV-A", "regionName": "CALABARZON"},
            ])
        if path.endswith("/regions/130000000/provinces.json"):
            return httpx.Response(200, json=[])
        if path.endswith("/regions/130000000/cities-municipalities.json"):
            return httpx.Response(200, json=[
                {"code": "137602000", "name": "City of Makati", "isCity": True, "provinceCode": None, "regionCode": "130000000"}
            ])
        if path.endswith("/cities-municipalities/137602000/barangays.json"):
            return httpx.Response(200, json=[
                {"code": "137602001", "name": "Bel-Air", "cityCode": "137602000"}
            ])
        if path.endswith("/regions/040000000/provinces.json"):
            return httpx.Response(200, json=[
                {"code": "043400000", "name": "Laguna", "regionCode": "040000000"}
            ])
        if path.endswith("/provinces/043400000/cities-municipalities.json"):
            return httpx.Response(200, json=[
                {"code": "043428000", "name": "City of Santa Rosa", "isCity": True, "provinceCode": "043400000", "regionCode": "040000000"}
            ])
        return httpx.Response(404, json={"error": "not found"})

    tr = _mock_transport(handler)

    async def _run() -> None:
        verified_ncr = await psgc_client.validate_address_hierarchy(
            region_code="130000000",
            city_code="137602000",
            barangay_code="137602001",
            transport=tr,
        )
        assert verified_ncr["verified"] is True
        assert verified_ncr["provinceName"] == "Metro Manila"
        assert verified_ncr["cityName"] == "City of Makati"
        assert verified_ncr["barangayName"] == "Bel-Air"

        verified_prov = await psgc_client.validate_address_hierarchy(
            region_code="040000000",
            province_code="043400000",
            city_code="043428000",
            transport=tr,
        )
        assert verified_prov["provinceName"] == "Laguna"
        assert verified_prov["cityName"] == "City of Santa Rosa"

        with pytest.raises(psgc_client.PsgcError) as exc_info:
            await psgc_client.validate_address_hierarchy(
                region_code="130000000",
                province_code="043400000",
                city_code="137602000",
                transport=tr,
            )
        assert exc_info.value.status_code == 400

    asyncio.run(_run())


def test_holiday_delivery_estimate_skips_holidays_and_sundays() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "/PublicHolidays/2026/PH" in request.url.path:
            return httpx.Response(200, json=[
                {"date": "2026-04-09", "name": "Day of Valor", "localName": "Araw ng Kagitingan", "countryCode": "PH", "types": ["Public"]},
                {"date": "2026-12-25", "name": "Christmas Day", "localName": "Araw ng Pasko", "countryCode": "PH", "types": ["Public"]},
            ])
        return httpx.Response(404, json=[])

    tr = _mock_transport(handler)
    est = asyncio.run(
        holiday_client.calculate_delivery_estimate(
            region_code="130000000",
            province="Metro Manila",
            city="City of Makati",
            from_date="2026-04-08",
            transport=tr,
        )
    )
    assert est["zone"] == "NCR"
    assert est["source"] == "NAGER_PH_HOLIDAYS"
    assert est["degraded"] is False
    assert est["estimatedDeliveryStart"] == "2026-04-11"
    assert est["estimatedDeliveryEnd"] == "2026-04-13"
    assert any(h["date"] == "2026-04-09" for h in est["holidaysInWindow"])


def test_holiday_degraded_mode_honest_sunday_fallback() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, content=b"Service Unavailable")

    tr = _mock_transport(handler)
    est = asyncio.run(
        holiday_client.calculate_delivery_estimate(
            region_code="040000000",
            province="Laguna",
            city="City of Santa Rosa",
            from_date="2026-04-08",
            retry_base_delay_ms=1,
            transport=tr,
        )
    )
    assert est["zone"] == "PROVINCIAL"
    assert est["degraded"] is True
    assert est["source"] == "FALLBACK_NO_HOLIDAY_DATA"
    assert est["holidaysInWindow"] == []
    assert "unavailable" in est["notice"].lower()


def test_live_free_external_apis_reachable_over_https() -> None:
    """Verify real HTTPS calls to both PSGC and Nager.Date public APIs work with zero API keys."""
    async def _run():
        psgc_h = await psgc_client.check_health(force_refresh=True, timeout_ms=8000)
        hol_h = await holiday_client.check_health(force_refresh=True)
        return psgc_h, hol_h

    psgc_health, hol_health = asyncio.run(_run())
    assert psgc_health["reachable"] is True
    assert psgc_health["regionCount"] >= 16
    assert hol_health["reachable"] is True
    assert hol_health["holidayCount"] >= 10
