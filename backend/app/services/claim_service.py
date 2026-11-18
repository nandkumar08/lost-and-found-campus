"""
Ownership claims and officer verification.

Workflow:
    submitted → under_review → (evidence_requested ⇄) → approved | rejected
An approved claim allows collection scheduling (see return_service.py).
A claim never marks an item as returned on its own.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.database.pool import pool
from app.image_processing.processor import UploadRejected, process_document
from app.services.notification_service import notify
from app.services.report_service import (
    get_report_row,
    record_status_event,
    serialize_public,
    _images_for,
)
from app.utils.helpers import clean_text, generate_claim_code, iso, paginate, paginated

EVIDENCE_DIR = "claims"


def serialize_claim(
    row: Dict[str, Any],
    evidence: Optional[List[dict]] = None,
    staff: bool = False,
    viewer_id: Optional[int] = None,
) -> Dict[str, Any]:
    # The claimant always sees the private answer they submitted; staff see it
    # for review. Nobody else can read a claim at all (checked in the router).
    show_answer = staff or (viewer_id is not None and row.get("claimant_user_id") == viewer_id)
    data = {
        "id": row["id"],
        "claim_code": row["claim_code"],
        "status": row["status"],
        "status_label": row["status"].replace("_", " ").title(),
        "identifying_answer": row.get("identifying_answer") if show_answer else None,
        "rejection_reason": row.get("rejection_reason"),
        "created_at": iso(row.get("created_at")),
        "reviewed_at": iso(row.get("reviewed_at")),
        "found_report": {
            "id": row.get("found_report_id"),
            "report_code": row.get("found_code"),
            "title": row.get("found_title"),
            "status": row.get("found_status"),
            "category": row.get("found_category"),
        },
        "lost_report_code": row.get("lost_code"),
        "match_id": row.get("match_id"),
        "evidence": evidence or [],
        "return": (
            {
                "id": row.get("return_id"),
                "return_code": row.get("return_code"),
                "status": row.get("return_status"),
                "scheduled_at": iso(row.get("scheduled_at")),
                "collection_location": row.get("collection_location"),
            }
            if row.get("return_id")
            else None
        ),
    }
    if staff:
        data.update(
            {
                "claimant": {
                    "id": row.get("claimant_user_id"),
                    "name": row.get("claimant_name"),
                    "email": row.get("claimant_email"),
                    "campus_id_number": row.get("claimant_campus_id"),
                    "role": row.get("claimant_role"),
                    "department": row.get("claimant_department"),
                    "verification_status": row.get("claimant_verification"),
                },
                "admin_notes": row.get("admin_notes"),
                "reviewed_by_name": row.get("reviewer_name"),
            }
        )
    return data


CLAIM_SELECT = """
    SELECT c.*, fr.report_code AS found_code, fr.title AS found_title,
           fr.status AS found_status, cat.name AS found_category,
           lr.report_code AS lost_code,
           cu.full_name AS claimant_name, cu.email AS claimant_email,
           cu.campus_id_number AS claimant_campus_id, cu.department AS claimant_department,
           rr.name AS claimant_role,
           cv.status AS claimant_verification,
           rv.full_name AS reviewer_name,
           ret.id AS return_id, ret.return_code, ret.status AS return_status,
           ret.scheduled_at, loc.name AS collection_location
    FROM claims c
    JOIN reports fr ON fr.id = c.found_report_id
    LEFT JOIN categories cat ON cat.id = fr.category_id
    LEFT JOIN reports lr ON lr.id = c.lost_report_id
    JOIN users cu ON cu.id = c.claimant_user_id
    JOIN roles rr ON rr.id = cu.role_id
    LEFT JOIN (
    SELECT user_id, MAX(id) AS latest_id
    FROM user_verifications
    GROUP BY user_id
) latest_cv ON latest_cv.user_id = cu.id
LEFT JOIN user_verifications cv ON cv.id = latest_cv.latest_id
    LEFT JOIN users rv ON rv.id = c.reviewed_by
    LEFT JOIN returns ret ON ret.claim_id = c.id AND ret.status <> 'cancelled'
    LEFT JOIN locations loc ON loc.id = ret.collection_location_id
"""


def _evidence_for(claim_ids: Sequence[int]) -> Dict[int, List[dict]]:
    if not claim_ids:
        return {}
    placeholders = ",".join(["%s"] * len(claim_ids))
    rows = pool.query_all(
        f"SELECT id, claim_id, file_path, original_name, mime_type, file_size, note, created_at "
        f"FROM claim_evidence WHERE claim_id IN ({placeholders}) AND deleted_at IS NULL",
        tuple(claim_ids),
    )
    grouped: Dict[int, List[dict]] = {}
    for row in rows:
        grouped.setdefault(row["claim_id"], []).append(
            {
                "id": row["id"],
                "name": row.get("original_name"),
                "note": row.get("note"),
                "url": f"/api/claims/evidence/{row['id']}",
                "uploaded_at": iso(row.get("created_at")),
            }
        )
    return grouped


def get_claim(claim_id: int, university_id: int) -> Optional[Dict[str, Any]]:
    return pool.query_one(CLAIM_SELECT + " WHERE c.id=%s AND c.university_id=%s", (claim_id, university_id))


def submit_claim(
    university_id: int,
    claimant: Dict[str, Any],
    found_report_id: int,
    identifying_answer: str,
    lost_report_id: Optional[int] = None,
    match_id: Optional[int] = None,
    evidence_files: Sequence[Tuple[bytes, str]] = (),
    evidence_note: Optional[str] = None,
) -> Dict[str, Any]:
    report = get_report_row(found_report_id, university_id)
    if not report or report["report_type"] != "found":
        raise ValueError("The selected found report does not exist in your university")
    if report["status"] in {"returned", "closed", "archived"}:
        raise ValueError("This item has already been closed or returned")
    if not identifying_answer or len(identifying_answer.strip()) < 15:
        raise ValueError(
            "Describe the private identifying details in at least 15 characters so an officer can verify ownership"
        )

    existing = pool.query_one(
        "SELECT id FROM claims WHERE found_report_id=%s AND claimant_user_id=%s",
        (found_report_id, claimant["id"]),
    )
    if existing:
        raise ValueError("You have already submitted a claim for this item")

    if lost_report_id:
        lost = get_report_row(lost_report_id, university_id)
        if not lost or lost["reporter_user_id"] != claimant["id"]:
            raise ValueError("You can only link your own lost report")
    device = clean_text(evidence_note, 255)

    with pool.transaction() as conn:
        with conn.cursor() as cur:
            claim_code = generate_claim_code()
            cur.execute(
                """
                INSERT INTO claims
                    (university_id, claim_code, found_report_id, claimant_user_id,
                     lost_report_id, match_id, identifying_answer, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'submitted')
                """,
                (
                    university_id,
                    claim_code,
                    found_report_id,
                    claimant["id"],
                    lost_report_id,
                    match_id,
                    clean_text(identifying_answer, 2000),
                ),
            )
            claim_id = cur.lastrowid

            for content, filename in evidence_files:
                try:
                    meta = process_document(content, filename, EVIDENCE_DIR)
                except UploadRejected as exc:
                    raise UploadRejected(f"Evidence file: {exc}") from exc
                cur.execute(
                    """
                    INSERT INTO claim_evidence
                        (university_id, claim_id, file_path, original_name, mime_type, file_size, note)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        university_id,
                        claim_id,
                        meta["file_path"],
                        meta["original_name"],
                        meta["mime_type"],
                        meta["file_size"],
                        device,
                    ),
                )

            cur.execute(
                """
                INSERT INTO ownership_verifications
                    (university_id, claim_id, match_id, status)
                VALUES (%s,%s,%s,'pending')
                """,
                (university_id, claim_id, match_id),
            )

    pool.execute(
        "UPDATE reports SET status='claim_pending' WHERE id=%s AND university_id=%s "
        "AND status NOT IN ('returned','closed','archived')",
        (found_report_id, university_id),
    )
    record_status_event(
        university_id,
        found_report_id,
        "claim_pending",
        note=f"Ownership claim {claim_code} submitted — awaiting officer verification",
        actor_user_id=claimant["id"],
        is_public=True,
    )

    # Notify claimant + every officer/admin in the tenant.
    notify(
        university_id,
        claimant["id"],
        "claim_submitted",
        f"Claim {claim_code} submitted",
        "Your ownership claim is queued for verification. You will be notified when an "
        "officer reviews the evidence.",
        ref_type="claim",
        ref_id=claim_code,
        email=True,
        email_to=claimant.get("email"),
    )
    staff = pool.query_all(
        "SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.university_id=%s AND r.code IN ('university_admin','security_personnel') "
        "AND u.deleted_at IS NULL AND u.account_status='active'",
        (university_id,),
    )
    for officer in staff:
        notify(
            university_id,
            officer["id"],
            "claim_pending_review",
            f"New claim {claim_code} awaiting verification",
            f"Claim filed for {report['report_code']} — {report['title']}.",
            ref_type="claim",
            ref_id=claim_code,
            email=True,
            email_to=officer["email"],
        )

    row = get_claim(claim_id, university_id)
    return serialize_claim(
        row, _evidence_for([claim_id]).get(claim_id, []), staff=False, viewer_id=claimant["id"]
    )


def list_claims(
    university_id: int,
    status: Optional[str] = None,
    claimant_user_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    staff: bool = True,
) -> Dict[str, Any]:
    pg = paginate(page, page_size)
    where = ["c.university_id = %s"]
    params: list[Any] = [university_id]
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            where.append("c.status IN (" + ",".join(["%s"] * len(statuses)) + ")")
            params.extend(statuses)
    if claimant_user_id:
        where.append("c.claimant_user_id = %s")
        params.append(claimant_user_id)
    clause = " AND ".join(where)
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM claims c WHERE {clause}", tuple(params), 0)
    rows = pool.query_all(
        CLAIM_SELECT + f" WHERE {clause} ORDER BY c.created_at DESC LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    evidence = _evidence_for([r["id"] for r in rows])
    items = [
        serialize_claim(row, evidence.get(row["id"], []), staff=staff, viewer_id=claimant_user_id)
        for row in rows
    ]
    return paginated(items, total, pg["page"], pg["page_size"])


def review_claim(
    university_id: int,
    claim_id: int,
    action: str,
    actor: Dict[str, Any],
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    verification_method: str = "combined",
    findings: Optional[str] = None,
) -> Dict[str, Any]:
    claim = get_claim(claim_id, university_id)
    if not claim:
        raise ValueError("Claim not found")
    if claim["status"] in {"approved", "rejected", "cancelled"}:
        raise ValueError(f"Claim is already {claim['status']}")

    if action not in {"approve", "reject", "request_evidence", "start_review"}:
        raise ValueError("Unsupported review action")
    if action == "reject" and not (reason and reason.strip()):
        raise ValueError("A rejection reason is required")

    if action == "start_review":
        pool.execute(
            "UPDATE claims SET status='under_review', reviewed_by=%s, reviewed_at=NOW(), admin_notes=%s WHERE id=%s",
            (actor["id"], clean_text(notes, 4000), claim_id),
        )
        notify(
            university_id,
            claim["claimant_user_id"],
            "claim_update",
            f"Claim {claim['claim_code']} is under review",
            "A campus officer has started verifying your ownership evidence.",
            ref_type="claim",
            ref_id=claim["claim_code"],
            email=True,
            email_to=claim["claimant_email"],
        )
        return {"status": "under_review"}

    if action == "request_evidence":
        pool.execute(
            "UPDATE claims SET status='evidence_requested', reviewed_by=%s, reviewed_at=NOW(), admin_notes=%s WHERE id=%s",
            (actor["id"], clean_text(notes, 4000), claim_id),
        )
        notify(
            university_id,
            claim["claimant_user_id"],
            "claim_evidence_request",
            f"Additional evidence requested for {claim['claim_code']}",
            reason or notes or "Please upload additional proof of ownership from your claim page.",
            ref_type="claim",
            ref_id=claim["claim_code"],
            email=True,
            email_to=claim["claimant_email"],
        )
        return {"status": "evidence_requested"}

    new_status = "approved" if action == "approve" else "rejected"
    pool.execute(
        """
        UPDATE claims SET status=%s, rejection_reason=%s, admin_notes=%s,
               reviewed_by=%s, reviewed_at=NOW()
        WHERE id=%s AND university_id=%s
        """,
        (
            new_status,
            clean_text(reason, 500) if action == "reject" else None,
            clean_text(notes, 4000),
            actor["id"],
            claim_id,
            university_id,
        ),
    )

    existing_verification = pool.query_one(
        "SELECT id FROM ownership_verifications WHERE claim_id=%s ORDER BY id DESC LIMIT 1", (claim_id,)
    )
    findings_text = clean_text(findings or notes, 2000)
    if existing_verification:
        pool.execute(
            """
            UPDATE ownership_verifications
            SET status=%s, officer_id=%s, verification_method=%s, findings=%s, completed_at=NOW()
            WHERE id=%s
            """,
            (
                "passed" if action == "approve" else "failed",
                actor["id"],
                verification_method,
                findings_text,
                existing_verification["id"],
            ),
        )
    else:
        pool.execute(
            """
            INSERT INTO ownership_verifications
                (university_id, claim_id, match_id, officer_id, verification_method,
                 findings, status, completed_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
            """,
            (
                university_id,
                claim_id,
                claim.get("match_id"),
                actor["id"],
                verification_method,
                findings_text,
                "passed" if action == "approve" else "failed",
            ),
        )

    if action == "approve":
        pool.execute(
            "UPDATE reports SET status='claim_pending' WHERE id=%s AND university_id=%s "
            "AND status NOT IN ('returned','closed','archived')",
            (claim["found_report_id"], university_id),
        )
        record_status_event(
            university_id,
            claim["found_report_id"],
            "claim_pending",
            note=f"Ownership verified for claim {claim['claim_code']} — collection scheduling available",
            actor_user_id=actor["id"],
            is_public=True,
        )
        notify(
            university_id,
            claim["claimant_user_id"],
            "claim_approved",
            f"Claim {claim['claim_code']} approved",
            "Ownership verified. Schedule your collection slot from the Claims page — "
            "bring your campus ID and the QR custody pass.",
            ref_type="claim",
            ref_id=claim["claim_code"],
            email=True,
            email_to=claim["claimant_email"],
            email_lines=[
                f"Claim {claim['claim_code']} for {claim['found_code']} has been approved.",
                "Log in to schedule a collection slot at the custody desk.",
                "Bring photo ID and your QR custody pass to the handover.",
            ],
        )
    else:
        pool.execute(
            "UPDATE reports SET status='in_custody' WHERE id=%s AND university_id=%s "
            "AND status='claim_pending'",
            (claim["found_report_id"], university_id),
        )
        record_status_event(
            university_id,
            claim["found_report_id"],
            "in_custody",
            note=f"Claim {claim['claim_code']} rejected — item remains in custody",
            actor_user_id=actor["id"],
            is_public=True,
        )
        notify(
            university_id,
            claim["claimant_user_id"],
            "claim_rejected",
            f"Claim {claim['claim_code']} was not approved",
            f"Reason: {reason}",
            ref_type="claim",
            ref_id=claim["claim_code"],
            email=True,
            email_to=claim["claimant_email"],
        )

    return {"status": new_status}


def add_evidence(
    university_id: int,
    claim_id: int,
    actor: Dict[str, Any],
    files: Sequence[Tuple[bytes, str]],
    note: Optional[str] = None,
) -> int:
    claim = get_claim(claim_id, university_id)
    if not claim or claim["claimant_user_id"] != actor["id"]:
        raise ValueError("Claim not found")
    if claim["status"] in {"approved", "rejected", "cancelled"}:
        raise ValueError("This claim can no longer be amended")
    if not files:
        raise ValueError("Select at least one file to upload")
    for content, filename in files:
        meta = process_document(content, filename, EVIDENCE_DIR)
        pool.execute(
            """
            INSERT INTO claim_evidence
                (university_id, claim_id, file_path, original_name, mime_type, file_size, note)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                university_id,
                claim_id,
                meta["file_path"],
                meta["original_name"],
                meta["mime_type"],
                meta["file_size"],
                clean_text(note, 255),
            ),
        )
    if claim["status"] == "evidence_requested":
        pool.execute("UPDATE claims SET status='under_review' WHERE id=%s", (claim_id,))
    staff = pool.query_all(
        "SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.university_id=%s AND r.code IN ('university_admin','security_personnel')",
        (university_id,),
    )
    for officer in staff:
        notify(
            university_id,
            officer["id"],
            "claim_evidence_added",
            f"New evidence uploaded for {claim['claim_code']}",
            "Additional ownership evidence is available for review.",
            ref_type="claim",
            ref_id=claim["claim_code"],
        )
    return len(files)


def cancel_claim(university_id: int, claim_id: int, actor: Dict[str, Any]) -> bool:
    claim = get_claim(claim_id, university_id)
    if not claim or claim["claimant_user_id"] != actor["id"]:
        raise ValueError("Claim not found")
    if claim["status"] in {"approved", "rejected"}:
        raise ValueError("An approved or rejected claim cannot be cancelled")
    pool.execute("UPDATE claims SET status='cancelled' WHERE id=%s", (claim_id,))
    pool.execute(
        "UPDATE reports SET status='in_custody' WHERE id=%s AND university_id=%s AND status='claim_pending'",
        (claim["found_report_id"], university_id),
    )
    return True
