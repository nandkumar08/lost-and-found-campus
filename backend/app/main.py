"""
Lost & Found Campus — FastAPI application entrypoint.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import (
    admin,
    analytics,
    auth,
    catalog,
    claims,
    matches,
    notifications,
    qr,
    reports,
    returns,
    uploads,
    users,
    verifications,
)
from app.config import settings
from app.database.pool import pool

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("lfc")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "Multi-university lost & found platform. JWT auth, campus identity verification, "
        "rule-based smart matching, server generated QR codes, ownership claims, returns and "
        "role-based dashboards. All data access is tenant isolated by `university_id`."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if not settings.is_dev:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Process-Time"] = f"{(time.perf_counter() - started) * 1000:.1f}ms"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get("msg", "Invalid request")
    field = ".".join(str(p) for p in first.get("loc", [])[1:])
    return JSONResponse(
        status_code=422, content={"detail": message, "field": field or None}
    )


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):  # pragma: no cover
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


@app.get("/api/health", tags=["system"])
def health() -> Dict[str, Any]:
    return {
        "status": "ok" if pool.health() else "degraded",
        "database": "connected" if pool.health() else "unavailable",
        "environment": settings.APP_ENV,
        "version": "1.0.0",
    }

@app.get("/api/health/time-debug", tags=["system"])
def time_debug():
    db = pool.query_one("""
        SELECT
            NOW() AS db_now,
            UTC_TIMESTAMP() AS db_utc,
            @@session.time_zone AS session_timezone,
            @@global.time_zone AS global_timezone
    """)

    return {
        "server_local": datetime.now().isoformat(),
        "server_utc": datetime.now(timezone.utc).isoformat(),
        "database": {
            "now": str(db["db_now"]) if db else None,
            "utc": str(db["db_utc"]) if db else None,
            "session_timezone": db["session_timezone"] if db else None,
            "global_timezone": db["global_timezone"] if db else None,
        },
    }
@app.get("/api/config/public", tags=["system"])
def public_config() -> Dict[str, Any]:
    """Non-sensitive bootstrapping data for the React client."""
    from app.services.auth_service import list_universities

    return {
        "app_name": settings.APP_NAME,
        "public_base_url": settings.PUBLIC_BASE_URL,
        "university_registry_enabled": True,
        "max_upload_mb": settings.MAX_UPLOAD_MB,
        "max_images_per_report": settings.MAX_IMAGES_PER_REPORT,
        "accepted_document_types": settings.ALLOWED_DOC_TYPES,
        "default_university_code": settings.DEFAULT_UNIVERSITY_CODE,
        "universities": list_universities(),
    }


for module in (
    auth,
    users,
    verifications,
    reports,
    catalog,
    matches,
    claims,
    returns,
    qr,
    notifications,
    admin,
    analytics,
    uploads,
):
    app.include_router(module.router)


# ---------------------------------------------------------------------------
# Serve the production React build from the same origin (optional).
# ---------------------------------------------------------------------------
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# Path prefixes that must never be answered with the SPA shell.
RESERVED_PREFIXES = ("api/",)  # API + docs live under /api, never the SPA shell

if FRONTEND_DIST.exists():
    _assets = FRONTEND_DIST / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Static files when they exist, otherwise index.html for client routing."""
        if full_path.startswith(RESERVED_PREFIXES):
            raise HTTPException(status_code=404, detail="Not found")
        root = FRONTEND_DIST.resolve()
        if full_path:
            candidate = (root / full_path).resolve()
            if candidate.is_file() and root in candidate.parents:
                return FileResponse(candidate)
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Frontend build not found")

    logger.info("Serving frontend build from %s", FRONTEND_DIST)


@app.on_event("startup")
def startup_checks() -> None:
    if not pool.health():
        logger.error("MySQL is unreachable — check DB_* environment variables")
    else:
        logger.info("Connected to MySQL database '%s'", settings.DB_NAME)
