"""STRIDERA Python Back-End — FastAPI Application Entry Point & OpenAPI Configuration."""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .core.config import PROJECT_ROOT, get_settings
from .core.database import SessionLocal, ping_database
from .core.security import utcnow_naive
from .core.serializers import to_iso_utc
from .routers import (
    admin,
    auth,
    brands,
    cart,
    categories,
    delivery,
    finance,
    inventory,
    locations,
    orders,
    payments,
    products,
    schedule,
    seller,
    support,
    wishlist,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("stridera.api")

settings = get_settings()

app = FastAPI(
    title="STRIDERA Footwear E-Commerce REST API",
    description=(
        "Modular Python FastAPI + SQLAlchemy 2.0 + PostgreSQL back-end powering the multi-seller "
        "STRIDERA footwear marketplace, 7-role RBAC portals, PSGC Philippine Address API, and "
        "Nager.Date Philippine Public Holidays Delivery ETA Estimator."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ─── CORS Configuration (Credentialed Localhost & Configured Origins) ────
allowed_origins = list(
    dict.fromkeys([
        settings.frontend_url,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    ])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Consistent Error Handlers Matching Next.js Frontend Contract ────────
@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    msg = str(exc.detail) if exc.detail else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": msg,
            "error": {"message": msg},
        },
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors: dict[str, str] = {}
    first_msg = "Validation error"
    for err in exc.errors():
        loc = err.get("loc") or []
        field_name = str(loc[-1]) if loc else "request"
        msg = str(err.get("msg") or "Invalid input")
        field_errors[field_name] = msg
        if first_msg == "Validation error":
            first_msg = f"{field_name}: {msg}"

    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": first_msg,
            "fieldErrors": field_errors,
            "error": {"message": first_msg, "details": field_errors},
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception in FastAPI request: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "error": {"message": "Internal server error"},
        },
    )


# ─── Static Asset & Upload Directories ──────────────────────────────────
assets_dir = PROJECT_ROOT / "backend" / "public" / "assets"
uploads_dir = PROJECT_ROOT / "backend" / "public" / "uploads"
uploads_products_dir = uploads_dir / "products"
uploads_products_dir.mkdir(parents=True, exist_ok=True)

if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


# ─── Root & Health Probes ───────────────────────────────────────────────
@app.get("/", tags=["System"])
def root_info() -> dict[str, Any]:
    return {
        "name": "STRIDERA Footwear E-Commerce API",
        "runtime": "Python FastAPI + SQLAlchemy 2.0",
        "python": sys.version.split()[0],
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/api/health",
    }


@app.get("/api/health", tags=["System"])
def health_check() -> JSONResponse:
    db = SessionLocal()
    db_ok = False
    try:
        db_ok = ping_database(db)
    except Exception:
        db_ok = False
    finally:
        db.close()

    status_code = 200 if db_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "success": db_ok,
            "status": "healthy" if db_ok else "degraded",
            "runtime": "Python FastAPI + SQLAlchemy 2.0",
            "pythonVersion": sys.version.split()[0],
            "database": "connected" if db_ok else "disconnected",
            "port": settings.port,
            "demoMode": settings.demo_mode,
            "externalApis": [
                {"name": "PSGC Philippine Address API", "baseUrl": os.getenv("PSGC_API_BASE_URL", "https://psgc.gitlab.io/api"), "health": "/api/locations/health"},
                {"name": "Nager.Date Public Holidays API", "baseUrl": os.getenv("HOLIDAY_API_BASE_URL", "https://date.nager.at/api/v3"), "health": "/api/schedule/health"},
            ],
            "timestamp": to_iso_utc(utcnow_naive()),
        },
    )


# ─── Register All 16 Modular FastAPI Routers ────────────────────────────
for r in (
    auth.router,
    products.router,
    categories.router,
    brands.router,
    cart.router,
    orders.router,
    payments.router,
    wishlist.router,
    locations.router,
    schedule.router,
    seller.router,
    inventory.router,
    delivery.router,
    support.router,
    finance.router,
    admin.router,
):
    app.include_router(r)
