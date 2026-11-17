"""Public browsing + tracking, report creation, owner and staff report actions."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile

from app.config import settings
from app.database.pool import pool
from app.deps import (
    audit,
    client_ip,
    get_current_user,
    get_optional_user,
    require_staff,
    tenant_id,
)
from app.image_processing.processor import UploadRejected
from app.qr.generator import qr_for_report
from app.schemas.models import ReportStatusPayload
from app.security import rate_limiter
from app.services import report_service
from app.services.auth_service import get_university
from app.utils.helpers import paginate, paginated, parse_date

router = APIRouter(prefix="/api/reports", tags=["reports"])

BROWSE_STATUSES = {"searching", "in_custody", "matched", "under_review", "claim_pending"}


def _resolve_university(university_code: Optional[str], university_id: Optional[int]) -> Dict[str, Any]:
    university = get_university(code=university_code) if university_code else None
    if not university and university_id:
        university = get_university(university_id=university_id)
    if not university:
        university = get_university()
    if not university:
        raise HTTPException(status_code=404, detail="University not found")
    return university


# ---------------------------------------------------------------------------
# Public browsing
# ---------------------------------------------------------------------------
@router.get("/public")
def browse_public(
    university_code: Optional[str] = Query(default=None),
    university_id: Optional[int] = Query(default=None),
    report_type: Optional[str] = Query(default=None, pattern="^(lost|found)$"),
    category_id: Optional[int] = None,
    location_id: Optional[int] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 12,
    sort: str = "recent",
) -> Dict[str, Any]:
    university = _resolve_university(university_code, university_id)
    if date_from and not parse_date(date_from):
        raise HTTPException(status_code=400, detail="date_from must be YYYY-MM-DD")
    if date_to and not parse_date(date_to):
        raise HTTPException(status_code=400, detail="date_to must be YYYY-MM-DD")
    result = report_service.list_reports(
        university_id=university["id"],
        report_type=report_type,
        status=",".join(BROWSE_STATUSES),
        category_id=category_id,
        location_id=location_id,
        query=q,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort=sort,
        include_confidential=False,
    )
    result["university"] = {"name": university["name"], "code": university["code"], "id": university["id"]}
    return result


@router.get("/public/{report_code}")
def public_detail(report_code: str, university_code: Optional[str] = None) -> Dict[str, Any]:
    university = _resolve_university(university_code, None)
    row = report_service.get_report_by_code(report_code, university["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    images = report_service._images_for([row["id"]]).get(row["id"], [])
    data = report_service.serialize_public(row, images)
    data["campus_contact"] = report_service.campus_contact(university["id"])
    data["timeline"] = report_service.status_history(row["id"], public_only=True)
    return data


@router.get("/track")
def track(
    code: str = Query(min_length=3, description="Report code, e.g. ALDU-LF-1004"),
    token: Optional[str] = Query(default=None, description="Tracking token from the original receipt"),
    university_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Secure tracking. The report code alone returns status only; the tracking
    token unlocks the fuller timeline and contact references (masked).
    """
    university_id = None
    if university_code:
        university = get_university(code=university_code)
        university_id = university["id"] if university else None
    row = report_service.get_report_by_code(code, university_id)
    if not row:
        raise HTTPException(status_code=404, detail="No report matches that ID")

    if token:
        view = report_service.secure_tracking_view(row["report_code"], token, row["university_id"])
        if not view:
            raise HTTPException(status_code=403, detail="Tracking token does not match this report")
        return {"mode": "full", **view}

    return {
        "mode": "status_only",
        "report": {
            "report_code": row["report_code"],
            "report_type": row["report_type"],
            "title": row["title"],
            "status": row["status"],
            "status_label": report_service.PUBLIC_STATUS_MAP.get(row["status"], row["status"]),
            "reported_at": report_service.iso(row["created_at"]),
        },
        "timeline": report_service.status_history(row["id"], public_only=True)[-4:],
        "hint": "Add your tracking token (printed under the QR code) to see the full timeline.",
        "campus_contact": report_service.campus_contact(row["university_id"]),
    }


# ---------------------------------------------------------------------------
# Creation (works for guests and signed-in users)
# ---------------------------------------------------------------------------
@router.post("", status_code=201)
async def create_report(
    request: Request,
    report_type: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    reporter_email: str = Form(...),
    incident_date: str = Form(...),
    category_id: Optional[int] = Form(default=None),
    colour: Optional[str] = Form(default=None),
    brand: Optional[str] = Form(default=None),
    confidential_marks: Optional[str] = Form(default=None),
    incident_time: Optional[str] = Form(default=None),
    location_id: Optional[int] = Form(default=None),
    location_text: Optional[str] = Form(default=None),
    reporter_name: Optional[str] = Form(default=None),
    reporter_phone: Optional[str] = Form(default=None),
    custody_location: Optional[str] = Form(default=None),
    custody_notes: Optional[str] = Form(default=None),
    university_code: Optional[str] = Form(default=None),
    images: List[UploadFile] = File(default=[]),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    ip = client_ip(request)
    allowed, retry = rate_limiter.check(f"report:{ip}", settings.RATE_LIMIT_REPORT)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many reports submitted. Retry in {retry}s.")

        if report_type not in {"lost", "found"}:
            raise HTTPException(status_code=400, detail="report_type must be 'lost' or 'found'")

        if report_type == "found" and not user:
            raise HTTPException(
                status_code=401,
                detail="Please login to your student account before reporting a found item."
            )

        if len(title.strip()) < 3:
            raise HTTPException(status_code=400, detail="Item name must be at least 3 characters")
        if len(description.strip()) < 10:
            raise HTTPException(status_code=400, detail="Description must be at least 10 characters")
    if len(title.strip()) < 3:
        raise HTTPException(status_code=400, detail="Item name must be at least 3 characters")
    if len(description.strip()) < 10:
        raise HTTPException(status_code=400, detail="Description must be at least 10 characters")
    if "@" not in reporter_email:
        raise HTTPException(status_code=400, detail="A valid contact email is required")
    if report_type == "found" and not (custody_location or location_text):
        raise HTTPException(
            status_code=400,
            detail="Found reports must include where the item is currently stored",
        )

    university = (
        get_university(university_id=user["university_id"])
        if user
        else _resolve_university(university_code, None)
    )

    uploads: List[tuple] = []
    for upload in images[: settings.MAX_IMAGES_PER_REPORT]:
        if upload and upload.filename:
            uploads.append((await upload.read(), upload.filename))

    payload = {
        "report_type": report_type,
        "title": title,
        "category_id": category_id,
        "description": description,
        "colour": colour,
        "brand": brand,
        "confidential_marks": confidential_marks,
        "incident_date": incident_date,
        "incident_time": incident_time,
        "location_id": location_id,
        "location_text": location_text,
        "reporter_name": reporter_name or (user["full_name"] if user else None),
        "reporter_email": reporter_email,
        "reporter_phone": reporter_phone,
        "custody_location": custody_location,
        "custody_notes": custody_notes,
    }
    try:
        result = report_service.create_report(
            university_id=university["id"],
            payload=payload,
            image_payloads=uploads,
            current_user=user,
            ip=ip,
        )
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    audit(
        user,
        "report_created",
        "report",
        result["report"]["report_code"],
        f"{report_type} report created ({university['code']})",
        ip=ip,
        university_id=university["id"],
    )
    result["report"]["qr"] = result["qr"]
    return result


# ---------------------------------------------------------------------------
# Owner views
# ---------------------------------------------------------------------------
@router.get("/mine")
def my_reports(
    report_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    own = report_service.list_reports(
        university_id=tenant_id(user),
        report_type=report_type,
        status=status,
        reporter_user_id=user["id"],
        page=page,
        page_size=page_size,
        include_confidential=True,
    )
    # Anonymous reports filed with the same email before signing up.
    if not own["items"]:
        alt = report_service.list_reports(
            university_id=tenant_id(user),
            report_type=report_type,
            status=status,
            page=page,
            page_size=page_size,
            include_confidential=True,
        )
        own["items"] = [
            item for item in alt["items"] if (item.get("reporter_email") or "").lower() == user["email"].lower()
        ]
        own["pagination"]["total"] = len(own["items"])
    for item in own["items"]:
        item["qr"] = qr_for_report(item["id"], tenant_id(user))
    return own


@router.get("/{report_id}")
def report_detail(
    report_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    row = report_service.get_report_row(report_id, tenant_id(user))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_staff = user["role_code"] in {"university_admin", "security_personnel"}
    is_owner = row.get("reporter_user_id") == user["id"]
    if not (is_staff or is_owner):
        raise HTTPException(status_code=403, detail="You do not have access to this report")
    images = report_service._images_for([report_id], include_private=is_staff).get(report_id, [])
    serialiser = report_service.serialize_staff if is_staff else report_service.serialize_owner
    data = serialiser(row, images)
    data["timeline"] = report_service.status_history(report_id, public_only=not is_staff)
    data["qr"] = qr_for_report(report_id, tenant_id(user))
    if is_staff:
        data["claims"] = [
            {"claim_code": c["claim_code"], "status": c["status"], "claimant": c["claimant_name"]}
            for c in pool.query_all(
                "SELECT c.claim_code, c.status, u.full_name AS claimant_name FROM claims c "
                "JOIN users u ON u.id=c.claimant_user_id WHERE c.found_report_id=%s",
                (report_id,),
            )
        ]
    return data


@router.get("/{report_id}/timeline")
def report_timeline(report_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    row = report_service.get_report_row(report_id, tenant_id(user))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_staff = user["role_code"] in {"university_admin", "security_personnel"}
    if not is_staff and row.get("reporter_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this report")
    return {"timeline": report_service.status_history(report_id, public_only=not is_staff)}


@router.patch("/{report_id}/status")
def update_status(
    report_id: int,
    payload: ReportStatusPayload,
    user: Dict[str, Any] = Depends(require_staff),
) -> Dict[str, Any]:
    allowed = {
        "searching", "in_custody", "matched", "under_review",
        "claim_pending", "return_scheduled", "returned", "closed", "archived",
    }
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported status")
    try:
        result = report_service.change_status(
            tenant_id(user), report_id, payload.status, actor=user, note=payload.note
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    audit(user, "report_status_changed", "report", report_id, f"Status → {payload.status}")
    return result


@router.delete("/{report_id}")
def withdraw_report(report_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    row = report_service.get_report_row(report_id, tenant_id(user))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_staff = user["role_code"] in {"university_admin", "security_personnel"}
    if not is_staff and row.get("reporter_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only withdraw your own report")
    if row["status"] in {"returned", "closed"}:
        raise HTTPException(status_code=400, detail="A completed report cannot be withdrawn")
    report_service.soft_delete(tenant_id(user), report_id, user)
    audit(user, "report_withdrawn", "report", report_id, "Report soft deleted")
    return {"message": "Report withdrawn"}
