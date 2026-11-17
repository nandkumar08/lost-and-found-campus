"""
Report creation, retrieval, serialisation and status transitions.

Privacy contract enforced here:
  * public serialisation never returns confidential_marks, reporter_email,
    reporter_phone, custody_location, tracking_token or internal notes.
  * authenticated owners / staff get the full record through separate helpers.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.database.pool import pool
from app.image_processing.processor import UploadRejected, process_image
from app.matching.engine import confidence_for, rank_candidates, score_pair
from app.qr.generator import create_qr
from app.security import mask_email, mask_phone, new_tracking_token
from app.services.notification_service import notify
from app.utils.helpers import (
    clean_text,
    generate_report_code,
    iso,
    paginate,
    parse_date,
    parse_time,
    paginated,
)

TERMINAL_STATUSES = {"returned", "closed", "archived"}

STATUS_LABELS = {
    "searching": "Searching",
    "in_custody": "In Safe Custody",
    "matched": "Match Found",
    "under_review": "Under Review",
    "claim_pending": "Claim Pending",
    "return_scheduled": "Return Scheduled",
    "returned": "Returned",
    "closed": "Closed",
    "archived": "Archived",
}

PUBLIC_STATUS_MAP = {
    "searching": "Searching",
    "in_custody": "In Safe Custody",
    "matched": "Match Found",
    "under_review": "Under Review",
    "claim_pending": "Claim In Progress",
    "return_scheduled": "Collection Scheduled",
    "returned": "Returned to Owner",
    "closed": "Closed",
    "archived": "Archived",
}

BASE_SELECT = """
    SELECT r.*, c.name AS category_name, l.name AS location_name, l.zone AS location_zone,
           u.name AS university_name, u.code AS university_code
    FROM reports r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN locations l ON l.id = r.location_id
    JOIN universities u ON u.id = r.university_id
"""


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def _images_for(report_ids: Sequence[int], include_private: bool = False) -> Dict[int, List[dict]]:
    if not report_ids:
        return {}
    placeholders = ",".join(["%s"] * len(report_ids))
    sql = (
        f"SELECT id, report_id, file_path, mime_type, width, height, is_primary, visibility, created_at "
        f"FROM report_images WHERE report_id IN ({placeholders}) AND deleted_at IS NULL "
    )
    if not include_private:
        sql += "AND visibility = 'public' "
    sql += "ORDER BY is_primary DESC, id ASC"
    rows = pool.query_all(sql, tuple(report_ids))
    grouped: Dict[int, List[dict]] = {}
    for row in rows:
        grouped.setdefault(row["report_id"], []).append(
            {
                "id": row["id"],
                "url": f"/api/uploads/{row['file_path']}",
                "is_primary": bool(row["is_primary"]),
                "width": row["width"],
                "height": row["height"],
                "visibility": row["visibility"],
            }
        )
    return grouped


def serialize_public(row: Dict[str, Any], images: Optional[List[dict]] = None) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "report_code": row["report_code"],
        "report_type": row["report_type"],
        "title": row["title"],
        "category": row.get("category_name"),
        "category_id": row.get("category_id"),
        "description": row["description"],
        "colour": row.get("colour"),
        "brand": row.get("brand"),
        "incident_date": iso(row.get("incident_date")),
        "incident_time": iso(row.get("incident_time")),
        "location": row.get("location_name") or row.get("location_text"),
        "location_id": row.get("location_id"),
        "zone": row.get("location_zone"),
        "status": row["status"],
        "status_label": PUBLIC_STATUS_MAP.get(row["status"], row["status"]),
        "university_name": row.get("university_name"),
        "university_code": row.get("university_code"),
        "images": images or [],
        "reported_at": iso(row.get("created_at")),
        # Custody location deliberately omitted for found items: only the
        # verified owner learns the collection point after claim approval.
    }


def serialize_owner(row: Dict[str, Any], images: Optional[List[dict]] = None) -> Dict[str, Any]:
    data = serialize_public(row, images)
    data.update(
        {
            "colour": row.get("colour"),
            "confidential_marks": row.get("confidential_marks"),
            "reporter_name": row.get("reporter_name"),
            "reporter_email": row.get("reporter_email"),
            "reporter_phone": row.get("reporter_phone"),
            "custody_location": row.get("custody_location"),
            "custody_notes": row.get("custody_notes"),
            "tracking_token": row.get("tracking_token"),
            "location_text": row.get("location_text"),
            "closed_at": iso(row.get("closed_at")),
        }
    )
    return data


def serialize_staff(row: Dict[str, Any], images: Optional[List[dict]] = None) -> Dict[str, Any]:
    data = serialize_owner(row, images)
    data["intake_officer_id"] = row.get("intake_officer_id")
    data["reporter_user_id"] = row.get("reporter_user_id")
    return data


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
def get_report_row(report_id: int, university_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    sql = BASE_SELECT + " WHERE r.id = %s AND r.deleted_at IS NULL"
    params: list[Any] = [report_id]
    if university_id is not None:
        sql += " AND r.university_id = %s"
        params.append(university_id)
    return pool.query_one(sql, tuple(params))


def get_report_by_code(code: str, university_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    sql = BASE_SELECT + " WHERE r.report_code = %s AND r.deleted_at IS NULL"
    params: list[Any] = [code.strip().upper()]
    if university_id is not None:
        sql += " AND r.university_id = %s"
        params.append(university_id)
    return pool.query_one(sql, tuple(params))


def get_report_by_token(token: str) -> Optional[Dict[str, Any]]:
    return pool.query_one(
        BASE_SELECT + " WHERE r.tracking_token = %s AND r.deleted_at IS NULL", (token,)
    )


def status_history(report_id: int, public_only: bool = False) -> List[dict]:
    sql = (
        "SELECT e.*, u.full_name AS actor_name FROM report_status_events e "
        "LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.report_id = %s "
    )
    if public_only:
        sql += "AND e.is_public = 1 "
    sql += "ORDER BY e.created_at ASC, e.id ASC"
    rows = pool.query_all(sql, (report_id,))
    return [
        {
            "status": row["to_status"],
            "label": PUBLIC_STATUS_MAP.get(row["to_status"], row["to_status"]),
            "note": row["note"],
            "at": iso(row["created_at"]),
            "actor": row.get("actor_name"),
        }
        for row in rows
    ]


def record_status_event(
    university_id: int,
    report_id: int,
    to_status: str,
    from_status: Optional[str] = None,
    note: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    is_public: bool = True,
) -> None:
    pool.execute(
        """
        INSERT INTO report_status_events
            (university_id, report_id, from_status, to_status, note, actor_user_id, is_public)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (university_id, report_id, from_status, to_status, note, actor_user_id, int(is_public)),
    )


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------
def create_report(
    university_id: int,
    payload: Dict[str, Any],
    image_payloads: Sequence[Tuple[bytes, str]] = (),
    current_user: Optional[Dict[str, Any]] = None,
    ip: Optional[str] = None,
) -> Dict[str, Any]:
    report_type = payload["report_type"]
    if report_type not in {"lost", "found"}:
        raise ValueError("report_type must be 'lost' or 'found'")
    if report_type == "found" and not current_user:
        raise ValueError(
            "Please login to your student account before reporting a found item."
        )
    university = pool.query_one("SELECT * FROM universities WHERE id=%s", (university_id,))
    if not university or university["status"] != "active":
        raise ValueError("This university is not accepting reports right now")

    category_id = payload.get("category_id")
    if category_id:
        valid = pool.query_one(
            "SELECT id FROM categories WHERE id=%s AND university_id=%s AND deleted_at IS NULL AND is_active=1",
            (category_id, university_id),
        )
        if not valid:
            raise ValueError("Selected category is not available for this university")

    location_id = payload.get("location_id")
    if location_id:
        valid = pool.query_one(
            "SELECT id FROM locations WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
            (location_id, university_id),
        )
        if not valid:
            raise ValueError("Selected location is not available for this university")

    incident_date = parse_date(payload.get("incident_date"))
    if not incident_date:
        raise ValueError("A valid incident date is required")
    from datetime import date as _date

    if incident_date > _date.today():
        raise ValueError("Incident date cannot be in the future")

    token = new_tracking_token()
    report_code = generate_report_code(university["code"])
    default_status = "searching" if report_type == "lost" else "in_custody"

    with pool.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO reports
                    (university_id, report_code, tracking_token, report_type, category_id,
                     title, description, colour, brand, confidential_marks, incident_date,
                     incident_time, location_id, location_text, status, reporter_user_id,
                     reporter_name, reporter_email, reporter_phone, custody_location,
                     custody_notes, intake_officer_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    university_id,
                    report_code,
                    token,
                    report_type,
                    category_id,
                    clean_text(payload.get("title"), 180),
                    clean_text(payload.get("description"), 4000),
                    clean_text(payload.get("colour"), 80),
                    clean_text(payload.get("brand"), 80),
                    clean_text(payload.get("confidential_marks"), 2000),
                    incident_date,
                    parse_time(payload.get("incident_time")),
                    location_id,
                    clean_text(payload.get("location_text"), 180),
                    default_status,
                    current_user["id"] if current_user else None,
                    clean_text(payload.get("reporter_name"), 140)
                    or (current_user["full_name"] if current_user else None),
                    (clean_text(payload.get("reporter_email"), 180) or "").lower(),
                    clean_text(payload.get("reporter_phone"), 40),
                    clean_text(payload.get("custody_location"), 180),
                    clean_text(payload.get("custody_notes"), 255),
                    current_user["id"] if current_user and report_type == "found" else None,
                ),
            )
            report_id = cur.lastrowid

            for index, (content, filename) in enumerate(image_payloads):
                try:
                    meta = process_image(content, filename, "reports")
                except UploadRejected as exc:
                    raise UploadRejected(f"Image {index + 1}: {exc}") from exc
                cur.execute(
                    """
                    INSERT INTO report_images
                        (university_id, report_id, file_path, original_name, mime_type,
                         file_size, width, height, is_primary, visibility)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'public')
                    """,
                    (
                        university_id,
                        report_id,
                        meta["file_path"],
                        meta["original_name"],
                        meta["mime_type"],
                        meta["file_size"],
                        meta["width"],
                        meta["height"],
                        1 if index == 0 else 0,
                    ),
                )

            cur.execute(
                """
                INSERT INTO report_status_events
                    (university_id, report_id, from_status, to_status, note, actor_user_id, is_public)
                VALUES (%s,%s,NULL,%s,%s,%s,1)
                """,
                (
                    university_id,
                    report_id,
                    default_status,
                    "Report submitted and logged in the campus registry",
                    current_user["id"] if current_user else None,
                ),
            )

    # QR code (server generated) + matching run happen outside the insert
    # transaction so a slow match query cannot roll back a valid report.
    qr = create_qr(
        university_id=university_id,
        purpose="tracking",
        report_id=report_id,
        report_code=report_code,
    )
    try:
        run_matching_for_report(report_id, university_id)
    except Exception:
        pass

    row = get_report_row(report_id, university_id) or {}
    images = _images_for([report_id], include_private=True).get(report_id, [])

    notify(
        university_id,
        current_user["id"] if current_user else None,
        "report_submitted",
        f"Report {report_code} received",
        f"Your {report_type} report for '{row.get('title')}' is now active. "
        f"Track it any time with the report ID and your tracking link.",
        ref_type="report",
        ref_id=report_code,
        email=True,
        email_to=row.get("reporter_email"),
        email_lines=[
            f"Report ID: {report_code}",
            f"Item: {row.get('title')}",
            f"Type: {report_type.title()}",
            f"Status: {STATUS_LABELS.get(default_status, default_status)}",
            f"Track: {qr['payload_url']}",
            "",
            "Keep this report ID safe. Confidential marks are never shown publicly.",
        ],
    )

    return {
        "report": serialize_owner(row, images),
        "qr": qr,
        "tracking_token": token,
        "tracking_url": qr["payload_url"],
    }


# ---------------------------------------------------------------------------
# Listing / filters
# ---------------------------------------------------------------------------
def list_reports(
    university_id: int,
    report_type: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    location_id: Optional[int] = None,
    query: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    reporter_user_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 12,
    sort: str = "recent",
    include_confidential: bool = False,
) -> Dict[str, Any]:
    pg = paginate(page, page_size)
    where = ["r.university_id = %s", "r.deleted_at IS NULL"]
    params: list[Any] = [university_id]

    if report_type in {"lost", "found"}:
        where.append("r.report_type = %s")
        params.append(report_type)
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            where.append("r.status IN (" + ",".join(["%s"] * len(statuses)) + ")")
            params.extend(statuses)
    if category_id:
        where.append("r.category_id = %s")
        params.append(category_id)
    if location_id:
        where.append("r.location_id = %s")
        params.append(location_id)
    if reporter_user_id:
        where.append("r.reporter_user_id = %s")
        params.append(reporter_user_id)
    if query:
        where.append(
            "(r.title LIKE %s OR r.description LIKE %s OR r.brand LIKE %s OR "
            "r.colour LIKE %s OR r.report_code LIKE %s OR r.location_text LIKE %s)"
        )
        like = f"%{query.strip()}%"
        params.extend([like] * 6)
    if date_from:
        where.append("r.incident_date >= %s")
        params.append(date_from)
    if date_to:
        where.append("r.incident_date <= %s")
        params.append(date_to)

    order = "r.created_at DESC, r.id DESC"
    if sort == "oldest":
        order = "r.created_at ASC, r.id ASC"
    elif sort == "incident":
        order = "r.incident_date DESC, r.incident_time DESC"

    clause = " AND ".join(where)
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM reports r WHERE {clause}", tuple(params), 0)
    rows = pool.query_all(
        BASE_SELECT + f" WHERE {clause} ORDER BY {order} LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    images = _images_for([r["id"] for r in rows])
    serialiser = serialize_staff if include_confidential else serialize_public
    items = [serialiser(row, images.get(row["id"], [])) for row in rows]
    return paginated(items, total, pg["page"], pg["page_size"])


# ---------------------------------------------------------------------------
# Secure tracking (report code + token)
# ---------------------------------------------------------------------------
def secure_tracking_view(code: str, token: str, university_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    row = get_report_by_code(code, university_id)
    if not row:
        return None
    if not token or row["tracking_token"] != token:
        return None
    matches = pool.query_all(
        "SELECT score, confidence, status FROM matches WHERE lost_report_id=%s OR found_report_id=%s "
        "ORDER BY score DESC LIMIT 5",
        (row["id"], row["id"]),
    )
    return {
        "report": {
            "report_code": row["report_code"],
            "report_type": row["report_type"],
            "title": row["title"],
            "status": row["status"],
            "status_label": PUBLIC_STATUS_MAP.get(row["status"], row["status"]),
            "category": row.get("category_name"),
            "location": row.get("location_name") or row.get("location_text"),
            "incident_date": iso(row.get("incident_date")),
            "incident_time": iso(row.get("incident_time")),
            "reported_at": iso(row.get("created_at")),
            "custody_location": row.get("custody_location"),
            "contact_email_masked": mask_email(row.get("reporter_email") or ""),
            "contact_phone_masked": mask_phone(row.get("reporter_phone")),
            "images": _images_for([row["id"]]).get(row["id"], []),
        },
        "timeline": status_history(row["id"], public_only=True),
        "match_summary": [
            {"score": float(m["score"]), "confidence": m["confidence"], "status": m["status"]}
            for m in matches
        ],
        "campus_contact": campus_contact(university_id or row["university_id"]),
    }


def campus_contact(university_id: int) -> Dict[str, Any]:
    row = pool.query_one(
        """
        SELECT u.name, u.contact_email, u.contact_phone, s.support_email, s.support_phone
        FROM universities u LEFT JOIN university_settings s ON s.university_id = u.id
        WHERE u.id = %s
        """,
        (university_id,),
    )
    if not row:
        return {}
    return {
        "university": row["name"],
        "email": row.get("support_email") or row.get("contact_email"),
        "phone": row.get("support_phone") or row.get("contact_phone"),
    }


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------
def change_status(
    university_id: int,
    report_id: int,
    to_status: str,
    actor: Optional[Dict[str, Any]] = None,
    note: Optional[str] = None,
    notify_owner: bool = True,
) -> Dict[str, Any]:
    row = get_report_row(report_id, university_id)
    if not row:
        raise ValueError("Report not found")
    from_status = row["status"]
    if from_status == to_status:
        return {"changed": False, "status": from_status}

    closed = to_status in TERMINAL_STATUSES
    pool.execute(
        "UPDATE reports SET status=%s, closed_at=%s WHERE id=%s AND university_id=%s",
        (to_status, __import__("datetime").datetime.now() if closed else None, report_id, university_id),
    )
    record_status_event(
        university_id,
        report_id,
        to_status,
        from_status=from_status,
        note=note,
        actor_user_id=actor["id"] if actor else None,
    )
    if notify_owner and row.get("reporter_user_id"):
        notify(
            university_id,
            row["reporter_user_id"],
            "report_status",
            f"Report {row['report_code']} updated: {PUBLIC_STATUS_MAP.get(to_status, to_status)}",
            note or f"Your report status changed from {from_status} to {to_status}.",
            ref_type="report",
            ref_id=row["report_code"],
            email=True,
            email_to=row.get("reporter_email"),
        )
    return {"changed": True, "status": to_status, "previous": from_status}


def soft_delete(university_id: int, report_id: int, actor: Optional[Dict[str, Any]]) -> bool:
    affected = pool.execute(
        "UPDATE reports SET deleted_at=NOW() WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
        (report_id, university_id),
    )
    if affected:
        record_status_event(
            university_id, report_id, "archived", note="Report withdrawn by reporter",
            actor_user_id=actor["id"] if actor else None, is_public=False,
        )
    return bool(affected)


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------
def _match_candidates(university_id: int, report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Opposite-type reports within a sensible date window, same tenant."""
    opposite = "found" if report["report_type"] == "lost" else "lost"
    rows = pool.query_all(
        BASE_SELECT
        + """
        WHERE r.university_id = %s AND r.deleted_at IS NULL AND r.report_type = %s
          AND r.status NOT IN ('returned','closed','archived')
          AND ABS(DATEDIFF(r.incident_date, %s)) <= 60
        ORDER BY r.incident_date DESC
        LIMIT 400
        """,
        (university_id, opposite, report["incident_date"]),
    )
    return rows


def run_matching_for_report(report_id: int, university_id: int) -> List[Dict[str, Any]]:
    report = get_report_row(report_id, university_id)
    if not report:
        return []
    settings_row = pool.query_one(
        "SELECT matching_high_threshold, matching_medium_threshold FROM university_settings WHERE university_id=%s",
        (university_id,),
    )
    high = float(settings_row["matching_high_threshold"]) if settings_row else 75.0
    medium = float(settings_row["matching_medium_threshold"]) if settings_row else 55.0

    candidates = _match_candidates(university_id, report)
    stored: List[Dict[str, Any]] = []

    for candidate in candidates:
        lost, found = (report, candidate) if report["report_type"] == "lost" else (candidate, report)
        result = score_pair(lost, found)
        if result["score"] < medium:
            continue
        confidence = confidence_for(result["score"], high, medium)
        if confidence == "low":
            continue
        existing = pool.query_one(
            "SELECT id, score, status FROM matches WHERE lost_report_id=%s AND found_report_id=%s",
            (lost["id"], found["id"]),
        )
        payload_breakdown = json.dumps(result["breakdown"])
        payload_fields = json.dumps(result["reasons"])
        if existing:
            if existing["status"] == "rejected":
                continue  # an officer rejected this pairing — never resurface it
            if float(existing["score"]) < result["score"]:
                pool.execute(
                    "UPDATE matches SET score=%s, confidence=%s, score_breakdown=%s, matched_fields=%s "
                    "WHERE id=%s",
                    (result["score"], confidence, payload_breakdown, payload_fields, existing["id"]),
                )
            match_id = existing["id"]
        else:
            match_id = pool.execute(
                """
                INSERT INTO matches
                    (university_id, lost_report_id, found_report_id, score, confidence,
                     score_breakdown, matched_fields, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'suggested')
                """,
                (
                    university_id,
                    lost["id"],
                    found["id"],
                    result["score"],
                    confidence,
                    payload_breakdown,
                    payload_fields,
                ),
            )
            _notify_match(university_id, lost, found, result, confidence)

        # A match flags the pairing for human review — it never auto-returns.
        stored.append(
            {
                "id": match_id,
                "lost_report_id": lost["id"],
                "found_report_id": found["id"],
                "lost_report_code": lost["report_code"],
                "found_report_code": found["report_code"],
                "score": result["score"],
                "confidence": confidence,
                "reasons": result["reasons"],
            }
        )

    if stored:
        highest = max(stored, key=lambda item: item["score"])
        if report["status"] in {"searching", "in_custody"} and highest["score"] >= high:
            pool.execute(
                "UPDATE reports SET status='matched' WHERE id=%s AND university_id=%s AND status IN ('searching','in_custody')",
                (report_id, university_id),
            )
            record_status_event(
                university_id, report_id, "matched",
                from_status=report["status"],
                note=f"Possible match detected by the smart matching engine ({highest['score']}%)",
                is_public=True,
            )
    return stored


def _notify_match(
    university_id: int,
    lost: Dict[str, Any],
    found: Dict[str, Any],
    result: Dict[str, Any],
    confidence: str,
) -> None:
    pct = round(result["score"])
    label = {"high": "High", "medium": "Medium", "low": "Low"}[confidence]
    if lost.get("reporter_user_id"):
        notify(
            university_id,
            lost["reporter_user_id"],
            "match_found",
            f"{label}-confidence match ({pct}%) for {lost['report_code']}",
            "A found item with similar attributes has been logged. Submit an ownership claim "
            "to begin verification.",
            ref_type="report",
            ref_id=lost["report_code"],
            email=True,
            email_to=lost.get("reporter_email"),
            email_lines=[
                f"Your lost report {lost['report_code']} may match a found item.",
                f"Confidence: {label} ({pct}%)",
                "A match is a lead, not proof of ownership. A campus officer verifies every claim.",
            ],
        )
    if found.get("reporter_user_id"):
        notify(
            university_id,
            found["reporter_user_id"],
            "match_found",
            f"{label}-confidence match ({pct}%) for custody record {found['report_code']}",
            "A lost report with similar attributes matched an item you logged.",
            ref_type="report",
            ref_id=found["report_code"],
        )


def matches_for_user(university_id: int, user_id: int) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        """
        SELECT m.*, lr.report_code AS lost_code, lr.title AS lost_title,
               fr.report_code AS found_code, fr.title AS found_title,
               fr.status AS found_status, lr.status AS lost_status
        FROM matches m
        JOIN reports lr ON lr.id = m.lost_report_id
        JOIN reports fr ON fr.id = m.found_report_id
        WHERE m.university_id = %s
          AND (lr.reporter_user_id = %s OR fr.reporter_user_id = %s)
        ORDER BY m.score DESC, m.created_at DESC
        LIMIT 50
        """,
        (university_id, user_id, user_id),
    )
    return [_serialize_match(row) for row in rows]


def _serialize_match(row: Dict[str, Any]) -> Dict[str, Any]:
    breakdown = row.get("score_breakdown")
    if isinstance(breakdown, (str, bytes)):
        try:
            breakdown = json.loads(breakdown)
        except Exception:
            breakdown = {}
    reasons = row.get("matched_fields")
    if isinstance(reasons, (str, bytes)):
        try:
            reasons = json.loads(reasons)
        except Exception:
            reasons = []
    return {
        "id": row["id"],
        "score": float(row["score"]),
        "confidence": row["confidence"],
        "status": row["status"],
        "breakdown": breakdown or {},
        "reasons": reasons or [],
        "created_at": iso(row.get("created_at")),
        "lost": {
            "id": row["lost_report_id"],
            "report_code": row.get("lost_code"),
            "title": row.get("lost_title"),
            "status": row.get("lost_status"),
        },
        "found": {
            "id": row["found_report_id"],
            "report_code": row.get("found_code"),
            "title": row.get("found_title"),
            "status": row.get("found_status"),
        },
        "review_notes": row.get("review_notes"),
    }


def list_matches(
    university_id: int,
    status: Optional[str] = None,
    confidence: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    pg = paginate(page, page_size)
    where = ["m.university_id = %s"]
    params: list[Any] = [university_id]
    if status:
        where.append("m.status = %s")
        params.append(status)
    if confidence:
        where.append("m.confidence = %s")
        params.append(confidence)
    clause = " AND ".join(where)
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM matches m WHERE {clause}", tuple(params), 0)
    rows = pool.query_all(
        f"""
        SELECT m.*, lr.report_code AS lost_code, lr.title AS lost_title,
               fr.report_code AS found_code, fr.title AS found_title,
               fr.status AS found_status, lr.status AS lost_status
        FROM matches m
        JOIN reports lr ON lr.id = m.lost_report_id
        JOIN reports fr ON fr.id = m.found_report_id
        WHERE {clause}
        ORDER BY m.score DESC, m.created_at DESC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    return paginated([_serialize_match(row) for row in rows], total, pg["page"], pg["page_size"])


def review_match(
    university_id: int,
    match_id: int,
    action: str,
    actor: Dict[str, Any],
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    match = pool.query_one(
        "SELECT * FROM matches WHERE id=%s AND university_id=%s", (match_id, university_id)
    )
    if not match:
        raise ValueError("Match not found")
    if action not in {"confirm", "reject"}:
        raise ValueError("action must be confirm or reject")

    new_status = "confirmed" if action == "confirm" else "rejected"
    pool.execute(
        "UPDATE matches SET status=%s, reviewed_by=%s, reviewed_at=NOW(), review_notes=%s WHERE id=%s",
        (new_status, actor["id"], clean_text(notes, 500), match_id),
    )
    for report_id in (match["lost_report_id"], match["found_report_id"]):
        record_status_event(
            university_id,
            report_id,
            "under_review" if action == "confirm" else "matched",
            note=(
                f"Match {new_status} by {actor['full_name']}"
                + (f" — {notes}" if notes else "")
            ),
            actor_user_id=actor["id"],
            is_public=action == "confirm",
        )
    # Notify the owner of the lost report (the likely claimant).
    lost = get_report_row(match["lost_report_id"], university_id)
    if lost and lost.get("reporter_user_id"):
        notify(
            university_id,
            lost["reporter_user_id"],
            "match_reviewed",
            f"Match review completed for {lost['report_code']}",
            (
                "Security has confirmed a probable match. You may now submit an ownership claim."
                if action == "confirm"
                else "A suggested match was reviewed and rejected. Your report remains active."
            ),
            ref_type="report",
            ref_id=lost["report_code"],
            email=True,
            email_to=lost.get("reporter_email"),
        )
    return {"id": match_id, "status": new_status}
