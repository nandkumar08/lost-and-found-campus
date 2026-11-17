"""QR generation, secure image delivery and scanning."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.database.pool import pool
from app.deps import audit, get_current_user, get_optional_user, require_staff, tenant_id
from app.qr.generator import build_print_sheet, create_qr, qr_for_report, resolve_qr
from app.services import report_service

router = APIRouter(prefix="/api/qr", tags=["qr"])


@router.get("/{qr_id}/image")
def qr_image(qr_id: int):
    """
    QR images contain no personal data, so they may be fetched without a
    session (needed for print sheets and the report confirmation screen).
    The opaque token inside the URL is the actual secret.
    """
    row = pool.query_one("SELECT image_path, revoked_at FROM qr_codes WHERE id=%s", (qr_id,))
    if not row or not row.get("image_path"):
        raise HTTPException(status_code=404, detail="QR code not found")
    if row["revoked_at"]:
        raise HTTPException(status_code=410, detail="This QR code has been revoked")
    path = settings.UPLOAD_DIR / row["image_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="QR image missing")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/report/{report_id}")
def qr_for_report_endpoint(
    report_id: int, user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    row = report_service.get_report_row(report_id, tenant_id(user))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_staff = user["role_code"] in {"university_admin", "security_personnel"}
    if not is_staff and row.get("reporter_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this report")
    qr = qr_for_report(report_id, tenant_id(user))
    if not qr:
        qr = create_qr(tenant_id(user), "tracking", report_id=report_id, report_code=row["report_code"])
        qr["image_url"] = f"/api/qr/{qr['id']}/image"
    return {"qr": qr, "print_sheet": build_print_sheet(row, qr)}


@router.get("/scan")
def scan(
    token: str = Query(min_length=8, description="Opaque token embedded in the QR payload"),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Resolve a scanned custody pass. Returns only public-safe data: the report
    code, type, title, status and a masked contact. Confidential marks and
    contact details require an authenticated officer session.
    """
    row = resolve_qr(token)
    if not row:
        raise HTTPException(status_code=404, detail="Unknown or revoked QR code")
    report = report_service.get_report_row(row["report_id"], row["university_id"]) if row.get("report_id") else None
    if not report:
        raise HTTPException(status_code=404, detail="Linked report not found")

    data: Dict[str, Any] = {
        "purpose": row["purpose"],
        "scan_count": int(row["scan_count"]) + 1,
        "report": {
            "report_code": report["report_code"],
            "report_type": report["report_type"],
            "title": report["title"],
            "status": report["status"],
            "status_label": report_service.PUBLIC_STATUS_MAP.get(report["status"], report["status"]),
            "category": report.get("category_name"),
            "location": report.get("location_name") or report.get("location_text"),
            "incident_date": report_service.iso(report.get("incident_date")),
        },
        "timeline": report_service.status_history(report["id"], public_only=True),
    }
    is_officer = bool(user and user["role_code"] in {"security_personnel", "university_admin"}
                      and user["university_id"] == row["university_id"])
    if is_officer:
        data["officer_view"] = {
            "custody_location": report.get("custody_location"),
            "confidential_marks": report.get("confidential_marks"),
            "reporter_name": report.get("reporter_name"),
            "reporter_email": report.get("reporter_email"),
            "reporter_phone": report.get("reporter_phone"),
            "claims": pool.query_all(
                "SELECT claim_code, status FROM claims WHERE found_report_id=%s ORDER BY id DESC",
                (report["id"],),
            ),
        }
        audit(user, "qr_scanned", "report", report["report_code"], f"purpose={row['purpose']}")
    return data
