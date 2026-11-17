"""
Server generated QR codes.

The QR payload contains ONLY a public tracking URL built from an unguessable
token (and the public report code). No names, phone numbers, serial numbers,
confidential marks or storage locations are ever encoded.

Two layers of protection are used:
  1. a short opaque token inside the URL,
  2. a sha256 hash of that token stored in `qr_codes` for verification and
     revocation, plus a separate `reports.tracking_token` used by the
     authenticated/public tracking endpoint.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import qrcode
from qrcode.constants import ERROR_CORRECT_M

from app.config import settings
from app.database.pool import pool
from app.security import new_qr_token, sha256_hex

BRAND_DARK = "#142822"
BRAND_ACCENT = "#D95D39"


def _render_png(payload: str, target: Path, box_size: int = 9) -> None:
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=box_size, border=3)
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color=BRAND_DARK, back_color="#FFFFFF").convert("RGB")
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)


def create_qr(
    university_id: int,
    purpose: str,
    report_id: Optional[int] = None,
    report_code: Optional[str] = None,
    claim_id: Optional[int] = None,
    return_id: Optional[int] = None,
) -> Dict[str, Any]:
    token = new_qr_token()
    code = f"QR-{token[:12].upper()}"
    path_map = {
        "tracking": f"/track/{report_code}" if report_code else "/track",
        "custody": "/security/scan",
        "handover": "/returns/verify",
    }
    payload_url = f"{settings.PUBLIC_BASE_URL}{path_map.get(purpose, '/track')}?qr={token}"
    if purpose != "tracking" and report_code:
        payload_url += f"&report={report_code}"

    image_rel = f"qr/{purpose}-{token[:16]}.png"
    _render_png(payload_url, settings.UPLOAD_DIR / image_rel)

    qr_id = pool.execute(
        """
        INSERT INTO qr_codes
            (university_id, report_id, claim_id, return_id, purpose, code,
             token_hash, image_path, payload_url)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            university_id,
            report_id,
            claim_id,
            return_id,
            purpose,
            code,
            sha256_hex(token),
            image_rel,
            payload_url,
        ),
    )
    return {
        "id": qr_id,
        "code": code,
        "purpose": purpose,
        "image_path": image_rel,
        "image_url": f"/api/qr/{qr_id}/image",
        "payload_url": payload_url,
        "token": token,
    }


def resolve_qr(token: str) -> Optional[Dict[str, Any]]:
    """Look a QR token up by hash, bumping scan counters."""
    row = pool.query_one(
        """
        SELECT q.*, r.report_code, r.report_type, r.status AS report_status,
               r.university_id AS report_university_id
        FROM qr_codes q
        LEFT JOIN reports r ON r.id = q.report_id
        WHERE q.token_hash = %s AND q.revoked_at IS NULL
        """,
        (sha256_hex(token),),
    )
    if not row:
        return None
    if row.get("expires_at"):
        from datetime import datetime

        if row["expires_at"] < datetime.now():
            return None
    pool.execute(
        "UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE id = %s",
        (row["id"],),
    )
    return row


def qr_for_report(report_id: int, university_id: int) -> Optional[Dict[str, Any]]:
    row = pool.query_one(
        "SELECT * FROM qr_codes WHERE report_id = %s AND purpose = 'tracking' AND revoked_at IS NULL "
        "ORDER BY id DESC LIMIT 1",
        (report_id,),
    )
    if not row or row["university_id"] != university_id:
        return None
    return {
        "id": row["id"],
        "code": row["code"],
        "purpose": row["purpose"],
        "image_url": f"/api/qr/{row['id']}/image",
        "payload_url": row["payload_url"],
        "scan_count": row["scan_count"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


def build_print_sheet(report: Dict[str, Any], qr: Dict[str, Any]) -> Dict[str, Any]:
    """Data for the printable custody pass (rendered client side / PDF ready)."""
    return {
        "report_code": report.get("report_code"),
        "report_type": report.get("report_type"),
        "item_name": report.get("title"),
        "qr_image": qr.get("image_url"),
        "tracking_url": qr.get("payload_url"),
        "instructions": "Present this pass at the campus security custody desk. "
                        "The code contains no personal information.",
    }
