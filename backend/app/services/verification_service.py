"""
Campus identity verification.

Uploading an ID document NEVER auto-approves an account. Every application is
queued for manual administrator review. Documents live under
uploads/private_documents and are only served through an authenticated,
permission-checked endpoint.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.database.pool import pool
from app.image_processing.processor import UploadRejected, process_document
from app.services.notification_service import notify
from app.utils.helpers import clean_text, iso

DOCUMENT_DIR = "private_documents"
VALID_STATUSES = {"pending", "under_review", "verified", "rejected", "suspended"}


def create_verification_application(
    university_id: int,
    user_id: int,
    requested_role_code: str,
    campus_id_number: Optional[str] = None,
    department: Optional[str] = None,
    academic_year: Optional[str] = None,
    semester: Optional[str] = None,
    designation: Optional[str] = None,
    applicant_note: Optional[str] = None,
    id_document: Optional[Tuple[bytes, str]] = None,
) -> str:
    with pool.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_verifications
                    (university_id, user_id, requested_role_code, status, campus_id_number,
                     department, academic_year, semester, designation, applicant_note)
                VALUES (%s,%s,%s,'pending',%s,%s,%s,%s,%s,%s)
                """,
                (
                    university_id,
                    user_id,
                    requested_role_code,
                    campus_id_number,
                    department,
                    academic_year,
                    semester,
                    designation,
                    clean_text(applicant_note, 1000),
                ),
            )
            verification_id = cur.lastrowid

            if id_document:
                content, filename = id_document
                try:
                    meta = process_document(content, filename, DOCUMENT_DIR)
                except UploadRejected as exc:
                    raise UploadRejected(f"Identity document: {exc}") from exc
                doc_type = "student_id"
                if requested_role_code in {"faculty", "university_staff", "security_personnel"}:
                    doc_type = "employee_id"
                elif requested_role_code == "campus_member":
                    doc_type = "institutional_letter"
                cur.execute(
                    """
                    INSERT INTO identity_documents
                        (university_id, user_id, verification_id, document_type, file_path,
                         original_name, mime_type, file_size)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        university_id,
                        user_id,
                        verification_id,
                        doc_type,
                        meta["file_path"],
                        meta["original_name"],
                        meta["mime_type"],
                        meta["file_size"],
                    ),
                )
    return "pending"


def upload_identity_document(
    university_id: int, user_id: int, content: bytes, filename: str
) -> Dict[str, Any]:
    verification = pool.query_one(
        "SELECT * FROM user_verifications WHERE user_id=%s ORDER BY id DESC LIMIT 1", (user_id,)
    )
    if not verification:
        verification_id = create_verification_application(
            university_id, user_id, "student", id_document=(content, filename)
        )
        return {"verification_status": verification_id, "message": "Application created with document"}
    if verification["status"] == "verified":
        raise ValueError("Your identity is already verified")
    if verification["status"] == "rejected":
        # A rejected applicant may resubmit; this opens a fresh application.
        create_verification_application(
            university_id, user_id, verification["requested_role_code"], id_document=(content, filename)
        )
        return {"verification_status": "pending", "message": "New application submitted for review"}

    meta = process_document(content, filename, DOCUMENT_DIR)
    doc_type = "student_id"
    if verification["requested_role_code"] in {"faculty", "university_staff", "security_personnel"}:
        doc_type = "employee_id"
    pool.execute(
        """
        INSERT INTO identity_documents
            (university_id, user_id, verification_id, document_type, file_path,
             original_name, mime_type, file_size)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            university_id,
            user_id,
            verification["id"],
            doc_type,
            meta["file_path"],
            meta["original_name"],
            meta["mime_type"],
            meta["file_size"],
        ),
    )
    pool.execute(
        "UPDATE user_verifications SET status='pending' WHERE id=%s AND status IN ('pending','under_review')",
        (verification["id"],),
    )
    return {"verification_status": "pending", "message": "Document uploaded — awaiting review"}


def serialize_verification(row: Dict[str, Any], documents: Optional[List[dict]] = None) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "status": row["status"],
        "status_label": row["status"].replace("_", " ").title(),
        "requested_role": row["requested_role_code"],
        "campus_id_number": row.get("campus_id_number"),
        "department": row.get("department"),
        "academic_year": row.get("academic_year"),
        "semester": row.get("semester"),
        "designation": row.get("designation"),
        "applicant_note": row.get("applicant_note"),
        "review_notes": row.get("review_notes"),
        "rejection_reason": row.get("rejection_reason"),
        "submitted_at": iso(row.get("submitted_at")),
        "reviewed_at": iso(row.get("reviewed_at")),
        "reviewed_by_name": row.get("reviewer_name"),
        "applicant": {
            "id": row.get("user_id"),
            "name": row.get("full_name"),
            "email": row.get("email"),
            "role": row.get("role_code"),
        }
        if row.get("full_name")
        else None,
        "documents": documents or [],
    }


def _documents_for(verification_ids: Sequence[int]) -> Dict[int, List[dict]]:
    if not verification_ids:
        return {}
    placeholders = ",".join(["%s"] * len(verification_ids))
    rows = pool.query_all(
        f"SELECT * FROM identity_documents WHERE verification_id IN ({placeholders}) AND deleted_at IS NULL",
        tuple(verification_ids),
    )
    grouped: Dict[int, List[dict]] = {}
    for row in rows:
        grouped.setdefault(row["verification_id"], []).append(
            {
                "id": row["id"],
                "document_type": row["document_type"],
                "original_name": row.get("original_name"),
                "mime_type": row["mime_type"],
                "file_size": row["file_size"],
                "uploaded_at": iso(row.get("uploaded_at")),
                # Private, permission-checked URL — never a public path.
                "url": f"/api/verifications/documents/{row['id']}",
            }
        )
    return grouped


def my_application(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    row = pool.query_one(
        """
        SELECT v.*, rv.full_name AS reviewer_name
        FROM user_verifications v
        LEFT JOIN users rv ON rv.id = v.reviewed_by
        WHERE v.user_id=%s ORDER BY v.id DESC LIMIT 1
        """,
        (user["id"],),
    )
    if not row:
        return None
    docs = _documents_for([row["id"]]).get(row["id"], [])
    data = serialize_verification(row, docs)
    data["account_status"] = user["account_status"]
    return data


def list_applications(
    university_id: int, status: Optional[str] = None, page: int = 1, page_size: int = 20
) -> Dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    where = ["v.university_id = %s"]
    params: list[Any] = [university_id]
    if status and status in VALID_STATUSES:
        where.append("v.status = %s")
        params.append(status)
    clause = " AND ".join(where)
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM user_verifications v WHERE {clause}", tuple(params), 0)
    rows = pool.query_all(
        f"""
        SELECT v.*, u.full_name, u.email, r.code AS role_code, rv.full_name AS reviewer_name
        FROM user_verifications v
        JOIN users u ON u.id = v.user_id
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN users rv ON rv.id = v.reviewed_by
        WHERE {clause}
        ORDER BY FIELD(v.status,'pending','under_review','rejected','verified','suspended'), v.submitted_at ASC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [page_size, (page - 1) * page_size]),
    )
    docs = _documents_for([r["id"] for r in rows])
    items = [serialize_verification(row, docs.get(row["id"], [])) for row in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


def review_application(
    university_id: int,
    verification_id: int,
    action: str,
    actor: Dict[str, Any],
    reason: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    row = pool.query_one(
        "SELECT v.*, u.full_name, u.email, u.id AS uid FROM user_verifications v "
        "JOIN users u ON u.id=v.user_id WHERE v.id=%s AND v.university_id=%s",
        (verification_id, university_id),
    )
    if not row:
        raise ValueError("Verification application not found")

    mapping = {
        "verify": "verified",
        "reject": "rejected",
        "start_review": "under_review",
        "suspend": "suspended",
        "reopen": "under_review",
    }
    if action not in mapping:
        raise ValueError("Unsupported verification action")
    new_status = mapping[action]
    if action == "reject" and not (reason and reason.strip()):
        raise ValueError("A rejection reason is required")

    pool.execute(
        """
        UPDATE user_verifications
        SET status=%s, review_notes=%s, rejection_reason=%s, reviewed_by=%s, reviewed_at=NOW()
        WHERE id=%s AND university_id=%s
        """,
        (
            new_status,
            clean_text(notes, 2000),
            clean_text(reason, 500) if action == "reject" else None,
            actor["id"],
            verification_id,
            university_id,
        ),
    )

    if new_status == "verified":
        pool.execute(
            "UPDATE users SET account_status='active', email_verified_at=COALESCE(email_verified_at,NOW()), "
            "campus_id_number=%s, department=COALESCE(%s,department), "
            "academic_year=COALESCE(%s,academic_year), semester=COALESCE(%s,semester), "
            "designation=COALESCE(%s,designation) WHERE id=%s AND university_id=%s",
            (
                row.get("campus_id_number"),
                row.get("department"),
                row.get("academic_year"),
                row.get("semester"),
                row.get("designation"),
                row["uid"],
                university_id,
            ),
        )
        message = "Your campus identity has been verified. Claims and handovers are now available."
    elif new_status == "rejected":
        pool.execute(
            "UPDATE users SET account_status='pending' WHERE id=%s AND account_status='pending'",
            (row["uid"],),
        )
        message = f"Your verification was rejected. Reason: {reason}"
    elif new_status == "suspended":
        pool.execute("UPDATE users SET account_status='suspended' WHERE id=%s", (row["uid"],))
        message = "Your campus access has been suspended. Contact the university administrator."
    else:
        message = f"Your verification status changed to {new_status.replace('_', ' ')}."

    notify(
        university_id,
        row["uid"],
        "verification_update",
        f"Campus identity status: {new_status.replace('_', ' ').title()}",
        message,
        ref_type="verification",
        ref_id=verification_id,
        email=True,
        email_to=row["email"],
        email_lines=[f"Hello {row['full_name']},", message],
    )
    return {"id": verification_id, "status": new_status}


def document_for_download(document_id: int, user: Dict[str, Any]) -> Dict[str, Any]:
    """Permission checked: owner, university admin, or platform admin only."""
    row = pool.query_one(
        "SELECT * FROM identity_documents WHERE id=%s AND deleted_at IS NULL", (document_id,)
    )
    if not row:
        raise ValueError("Document not found")
    if row["university_id"] != user["university_id"] and user["role_code"] != "platform_admin":
        raise PermissionError("This document belongs to another university")
    if user["role_code"] not in {"university_admin", "platform_admin"} and row["user_id"] != user["id"]:
        raise PermissionError("You may only view your own identity documents")
    return row
