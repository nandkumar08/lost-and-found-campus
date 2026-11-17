"""
Secure image handling with Pillow.

* Verifies real content type from bytes (never trusts Content-Type or the
  filename), re-encodes images which strips EXIF/metadata, resizes oversized
  images and applies a size ceiling.
* Files are written under randomised names inside the configured upload
  directory so user supplied names never touch the filesystem.
"""
from __future__ import annotations

import io
import mimetypes
import secrets
import shutil
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

MAX_DIMENSION = 1920
THUMB_DIMENSION = 640

ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


class UploadRejected(Exception):
    """Raised when an upload fails validation."""


def _safe_name(original: str, extension: str) -> str:
    stem = Path(original or "upload").stem
    stem = "".join(c for c in stem if c.isalnum() or c in "-_")[:40] or "upload"
    return f"{stem}-{secrets.token_hex(12)}.{extension}"


def _validate_size(size: int, limit_mb: int) -> None:
    if size <= 0:
        raise UploadRejected("The uploaded file is empty")
    if size > limit_mb * 1024 * 1024:
        raise UploadRejected(f"File exceeds the {limit_mb} MB limit")


def process_image(
    content: bytes,
    original_name: str,
    subdirectory: str,
    max_mb: int | None = None,
    resize: bool = True,
) -> Dict[str, object]:
    """Validate, normalise and persist a public image. Returns metadata dict."""
    max_mb = max_mb or settings.MAX_UPLOAD_MB
    _validate_size(len(content), max_mb)
    try:
        Image.open(io.BytesIO(content)).verify()
        image = Image.open(io.BytesIO(content))
        fmt = (image.format or "").upper()
        image = ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise UploadRejected("That file is not a readable image") from exc

    if fmt not in ALLOWED_FORMATS:
        raise UploadRejected("Only JPG, PNG and WEBP images are accepted")

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    if resize and max(image.size) > MAX_DIMENSION:
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    extension = ALLOWED_FORMATS[fmt]
    directory = settings.UPLOAD_DIR / subdirectory
    directory.mkdir(parents=True, exist_ok=True)
    filename = _safe_name(original_name, extension)
    path = directory / filename

    save_format = "JPEG" if extension == "jpg" else extension.upper()
    save_kwargs = {"optimize": True, "quality": 86} if save_format == "JPEG" else {"optimize": True}
    image.save(path, format=save_format, **save_kwargs)

    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[extension]
    return {
        "file_path": f"{subdirectory}/{filename}",
        "mime_type": mime,
        "file_size": path.stat().st_size,
        "width": image.width,
        "height": image.height,
        "original_name": original_name[:255],
    }


def process_document(content: bytes, original_name: str, subdirectory: str) -> Dict[str, object]:
    """Identity documents / evidence: images are re-encoded, PDFs stored as-is."""
    _validate_size(len(content), settings.MAX_UPLOAD_MB)
    guessed = (mimetypes.guess_type(original_name or "")[0] or "").lower()

    if content[:5] == b"%PDF-":
        if "application/pdf" not in settings.ALLOWED_DOC_TYPES:
            raise UploadRejected("PDF uploads are disabled for this institution")
        directory = settings.UPLOAD_DIR / subdirectory
        directory.mkdir(parents=True, exist_ok=True)
        filename = _safe_name(original_name, "pdf")
        path = directory / filename
        path.write_bytes(content)
        return {
            "file_path": f"{subdirectory}/{filename}",
            "mime_type": "application/pdf",
            "file_size": path.stat().st_size,
            "width": None,
            "height": None,
            "original_name": original_name[:255],
        }

    if guessed not in settings.ALLOWED_DOC_TYPES and guessed:
        raise UploadRejected("Unsupported document type")
    return process_image(content, original_name, subdirectory)


def delete_file(relative_path: str) -> None:
    """Remove a stored file (used for replaced/soft-deleted assets)."""
    try:
        target = (settings.UPLOAD_DIR / relative_path).resolve()
        root = settings.UPLOAD_DIR.resolve()
        if root in target.parents and target.exists():
            target.unlink()
    except Exception:
        pass


def make_thumbnail(relative_path: str) -> Tuple[str, int, int]:
    """Generate a small thumbnail next to the original; returns new path."""
    source = settings.UPLOAD_DIR / relative_path
    if not source.exists():
        raise UploadRejected("Stored image not found")
    with Image.open(source) as image:
        image = image.convert("RGB")
        image.thumbnail((THUMB_DIMENSION, THUMB_DIMENSION), Image.LANCZOS)
        thumb_rel = str(Path(relative_path).with_name(f"thumb-{Path(relative_path).stem}.jpg"))
        thumb_path = settings.UPLOAD_DIR / thumb_rel
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(thumb_path, format="JPEG", optimize=True, quality=80)
        return thumb_rel, image.width, image.height


def copy_private(relative_path: str, subdirectory: str) -> str:
    """Copy a file into a private directory (e.g. evidence snapshots)."""
    source = settings.UPLOAD_DIR / relative_path
    if not source.exists():
        return relative_path
    directory = settings.UPLOAD_DIR / subdirectory
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / source.name
    shutil.copy2(source, target)
    return f"{subdirectory}/{source.name}"
