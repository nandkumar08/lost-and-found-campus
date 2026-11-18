"""University-scoped user management for administrators."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database.pool import pool
from app.services.notification_service import notify
from app.utils.helpers import clean_text, iso, paginate, paginated

USER_SELECT = """
    SELECT u.id, u.university_id, u.full_name, u.email, u.phone, u.campus_id_number,
           u.department, u.academic_year, u.semester, u.designation, u.account_status,
           u.email_verified_at, u.last_login_at, u.created_at,
           r.code AS role_code, r.name AS role_name,
           v.status AS verification_status
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN (
    SELECT user_id, MAX(id) AS latest_id
    FROM user_verifications
    GROUP BY user_id
) latest_v ON latest_v.user_id = u.id
LEFT JOIN user_verifications v ON v.id = latest_v.latest_id
"""


def serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "phone": row.get("phone"),
        "campus_id_number": row.get("campus_id_number"),
        "department": row.get("department"),
        "academic_year": row.get("academic_year"),
        "semester": row.get("semester"),
        "designation": row.get("designation"),
        "role": row["role_code"],
        "role_label": row["role_name"],
        "account_status": row["account_status"],
        "verification_status": row.get("verification_status") or "not_submitted",
        "last_login_at": iso(row.get("last_login_at")),
        "created_at": iso(row.get("created_at")),
    }


def list_users(
    university_id: int,
    query: Optional[str] = None,
    role: Optional[str] = None,
    account_status: Optional[str] = None,
    verification_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    pg = paginate(page, page_size)
    where = ["u.university_id = %s", "u.deleted_at IS NULL"]
    params: list[Any] = [university_id]

    if query:
        where.append("(u.full_name LIKE %s OR u.email LIKE %s OR u.campus_id_number LIKE %s)")
        like = f"%{query.strip()}%"
        params.extend([like, like, like])
    if role:
        where.append("r.code = %s")
        params.append(role)
    if account_status:
        where.append("u.account_status = %s")
        params.append(account_status)
    if verification_status:
        where.append("v.status = %s")
        params.append(verification_status)

    clause = " AND ".join(where)
    total = pool.scalar(
    f"""
    SELECT COUNT(*) AS c
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN (
        SELECT user_id, MAX(id) AS latest_id
        FROM user_verifications
        GROUP BY user_id
    ) latest_v ON latest_v.user_id = u.id
    LEFT JOIN user_verifications v ON v.id = latest_v.latest_id
    WHERE {clause}
    """,
    tuple(params),
    0,
)

    rows = pool.query_all(
        USER_SELECT + f" WHERE {clause} ORDER BY u.created_at DESC LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    return paginated([serialize_user(r) for r in rows], total, pg["page"], pg["page_size"])


def get_user(university_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    row = pool.query_one(
        USER_SELECT + " WHERE u.id=%s AND u.university_id=%s AND u.deleted_at IS NULL",
        (user_id, university_id),
    )
    return serialize_user(row) if row else None


def set_account_status(
    university_id: int, user_id: int, account_status: str, actor: Dict[str, Any], reason: Optional[str] = None
) -> Dict[str, Any]:
    if account_status not in {"active", "pending", "suspended", "deactivated"}:
        raise ValueError("Unsupported account status")
    target = pool.query_one(
        "SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.id=%s AND u.university_id=%s",
        (user_id, university_id),
    )
    if not target:
        raise ValueError("User not found in your university")
    if target["role_code"] == "platform_admin":
        raise ValueError("Platform administrators cannot be managed from a university workspace")
    if target["id"] == actor["id"] and account_status != "active":
        raise ValueError("You cannot suspend your own account")

    pool.execute(
        "UPDATE users SET account_status=%s WHERE id=%s AND university_id=%s",
        (account_status, user_id, university_id),
    )
    notify(
        university_id,
        user_id,
        "account_status",
        f"Account status updated: {account_status.title()}",
        reason or "Your account status was changed by a university administrator.",
        ref_type="user",
        ref_id=user_id,
        email=True,
        email_to=target["email"],
    )
    return {"id": user_id, "account_status": account_status}


def change_role(
    university_id: int,
    user_id: int,
    role_code: str,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    if role_code in {"platform_admin"}:
        raise ValueError("Platform administrator roles cannot be assigned here")
    role = pool.query_one("SELECT * FROM roles WHERE code=%s", (role_code,))
    if not role:
        raise ValueError("Unknown role")
    target = pool.query_one(
        "SELECT id FROM users WHERE id=%s AND university_id=%s", (user_id, university_id)
    )
    if not target:
        raise ValueError("User not found in your university")
    if target["id"] == actor["id"] and role_code != "university_admin":
        raise ValueError("You cannot remove your own administrator role")
    pool.execute(
        "UPDATE users SET role_id=%s WHERE id=%s AND university_id=%s",
        (role["id"], user_id, university_id),
    )
    return {"id": user_id, "role": role_code}


def soft_delete_user(university_id: int, user_id: int, actor: Dict[str, Any]) -> bool:
    if user_id == actor["id"]:
        raise ValueError("You cannot delete your own account")
    affected = pool.execute(
        "UPDATE users SET deleted_at=NOW(), account_status='deactivated' "
        "WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
        (user_id, university_id),
    )
    return bool(affected)
