"""Small shared helpers: code generation, pagination, text cleanup, dates."""
from __future__ import annotations

import re
import secrets
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Optional, Sequence

from app.database.pool import pool


# ---------------------------------------------------------------------------
# Human facing identifiers
# ---------------------------------------------------------------------------
def _next_sequence(prefix: str) -> int:
    """Derive the next sequence number from existing codes for the prefix."""
    row = pool.query_one(
        "SELECT report_code FROM reports WHERE report_code LIKE %s ORDER BY id DESC LIMIT 1",
        (f"{prefix}-%",),
    )
    if row:
        try:
            return int(row["report_code"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return 1


def generate_report_code(university_code: str) -> str:
    """e.g. ALDU-LF-1001 — unique and human readable."""
    prefix = f"{university_code}-LF"
    number = max(1000, _next_sequence(prefix))
    # Retry on the (unlikely) collision so the unique index stays authoritative.
    for _ in range(50):
        code = f"{prefix}-{number:04d}"
        if not pool.scalar("SELECT COUNT(*) AS c FROM reports WHERE report_code = %s", (code,), 0):
            return code
        number += 1
    return f"{prefix}-{secrets.token_hex(3).upper()}"


def generate_code(table: str, column: str, prefix: str, pad: int = 4) -> str:
    for _ in range(25):
        candidate = f"{prefix}-{secrets.randbelow(9000) + 1000}"
        if not pool.scalar(f"SELECT COUNT(*) AS c FROM {table} WHERE {column} = %s", (candidate,), 0):
            return candidate
    return f"{prefix}-{secrets.token_hex(4).upper()}"


def generate_claim_code() -> str:
    return generate_code("claims", "claim_code", "CLM")


def generate_return_code() -> str:
    return generate_code("returns", "return_code", "RET")


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------
def paginate(page: int = 1, page_size: int = 12, max_page_size: int = 100) -> Dict[str, int]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 12), max_page_size))
    return {"page": page, "page_size": page_size, "offset": (page - 1) * page_size}


def paginated(items: Sequence[Any], total: int, page: int, page_size: int) -> Dict[str, Any]:
    pages = (total + page_size - 1) // page_size if page_size else 0
    return {
        "items": list(items),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
    }


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
_WS = re.compile(r"\s+")


def clean_text(value: Optional[str], max_len: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    cleaned = _WS.sub(" ", str(value)).strip()
    if not cleaned:
        return None
    return cleaned[:max_len] if max_len else cleaned


def normalise(value: Optional[str]) -> str:
    return (clean_text(value) or "").lower()


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------
def iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        total = int(value.total_seconds())
        return f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
    return str(value)


def now() -> datetime:
    return datetime.now()


def parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def parse_time(value: Optional[str]) -> Optional[time]:
    if not value:
        return None
    text = str(value)[:8]
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def public_report_id(report_code: str) -> str:
    return report_code
