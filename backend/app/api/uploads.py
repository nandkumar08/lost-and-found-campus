"""
Public delivery of *public* report images only.

Private directories (identity documents, claim evidence) are never served from
here — they require the permission-checked endpoints in verifications.py and
claims.py. Path traversal is blocked explicitly.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

PUBLIC_PREFIXES = ("reports/", "branding/", "qr/")
BLOCKED_PREFIXES = ("private_documents/", "claims/", "receipts/")


@router.get("/{file_path:path}")
def serve_public(file_path: str):
    normalised = file_path.replace("\\", "/").lstrip("/")
    if normalised.startswith(BLOCKED_PREFIXES):
        raise HTTPException(status_code=404, detail="Not found")
    if not normalised.startswith(PUBLIC_PREFIXES):
        raise HTTPException(status_code=404, detail="Not found")

    root = settings.UPLOAD_DIR.resolve()
    target = (root / normalised).resolve()
    if root not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    media = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(
        target,
        media_type=media,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
