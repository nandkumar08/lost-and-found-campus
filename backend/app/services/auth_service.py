"""
Registration, login, password reset. All access control decisions are made
server side; the frontend never decides who may log in or what they may see.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.config import settings
from app.database.pool import pool
from app.notifications.mailer import render_template, send_email
from app.security import (
    create_access_token,
    hash_password,
    password_strength_problems,
    sha256_hex,
    verify_password,
)
from app.services.notification_service import notify
from app.services.verification_service import create_verification_application
from app.utils.helpers import clean_text, iso

logger = logging.getLogger("lfc.auth")

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
SELF_REGISTRATION_ROLES = {
    "student",
    "faculty",
    "university_staff",
    "security_personnel",
    "campus_member",
}


def get_university(university_id: Optional[int] = None, code: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if code:
        return pool.query_one(
            "SELECT * FROM universities WHERE code=%s AND deleted_at IS NULL", (code.upper(),)
        )
    if university_id:
        return pool.query_one(
            "SELECT * FROM universities WHERE id=%s AND deleted_at IS NULL", (university_id,)
        )
    return pool.query_one(
        "SELECT * FROM universities WHERE code=%s AND deleted_at IS NULL",
        (settings.DEFAULT_UNIVERSITY_CODE.upper(),),
    )


def list_universities() -> List[Dict[str, Any]]:
    rows = pool.query_all(
        "SELECT id, name, short_name, code, primary_color, accent_color, status, contact_email, "
        "contact_phone, city, region, logo_path FROM universities "
        "WHERE deleted_at IS NULL AND status='active' ORDER BY name"
    )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "short_name": row["short_name"],
            "code": row["code"],
            "primary_color": row["primary_color"],
            "accent_color": row["accent_color"],
            "logo_url": f"/api/uploads/{row['logo_path']}" if row.get("logo_path") else None,
            "contact_email": row["contact_email"],
            "contact_phone": row.get("contact_phone"),
            "city": row.get("city"),
            "region": row.get("region"),
        }
        for row in rows
    ]


def register_user(
    payload: Dict[str, Any],
    id_document: Optional[tuple] = None,
    ip: Optional[str] = None,
) -> Dict[str, Any]:
    university = get_university(code=payload.get("university_code")) if payload.get("university_code") else None
    if not university:
        university = get_university(university_id=payload.get("university_id"))
    if not university:
        raise ValueError("Please choose a valid university")
    if university["status"] != "active":
        raise ValueError("This university is not accepting registrations right now")

    email = (payload.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address")

    role_code = (payload.get("role") or "").strip()
    if role_code not in SELF_REGISTRATION_ROLES:
        raise ValueError(
            "Administrator accounts are provisioned internally. Choose a student, faculty, "
            "staff, security or campus member role."
        )

    problems = password_strength_problems(payload.get("password") or "")
    if problems:
        raise ValueError("Password must contain " + ", ".join(problems))

    if payload.get("password") != payload.get("confirm_password"):
        raise ValueError("Passwords do not match")

    existing = pool.query_one("SELECT id FROM users WHERE email=%s", (email,))
    if existing:
        raise ValueError("An account with this email already exists")

    role = pool.query_one("SELECT * FROM roles WHERE code=%s", (role_code,))
    if not role:
        raise ValueError("Unknown role")

     

    campus_id = clean_text(payload.get("campus_id_number"), 60)
    if not campus_id:
        raise ValueError("Your enrollment or employee ID is required")
    dup_id = pool.query_one(
        "SELECT id FROM users WHERE university_id=%s AND campus_id_number=%s",
        (university["id"], campus_id),
    )
    if dup_id:
        raise ValueError("That campus ID is already registered. Contact the administrator if this is an error.")

    full_name = clean_text(payload.get("full_name"), 140)
    if not full_name or len(full_name) < 3:
        raise ValueError("Enter your full name as printed on your campus ID")

    password_hash = hash_password(payload["password"])
    user_id = pool.execute(
        """
        INSERT INTO users
            (university_id, role_id, full_name, email, phone, password_hash,
             campus_id_number, department, academic_year, semester, designation,
             account_status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending')
        """,
        (
            university["id"],
            role["id"],
            full_name,
            email,
            clean_text(payload.get("phone"), 40),
            password_hash,
            campus_id,
            clean_text(payload.get("department"), 140),
            clean_text(payload.get("academic_year"), 40),
            clean_text(payload.get("semester"), 40),
            clean_text(payload.get("designation"), 120),
        ),
    )

    verification_status = create_verification_application(
        university_id=university["id"],
        user_id=user_id,
        requested_role_code=role_code,
        campus_id_number=campus_id,
        department=clean_text(payload.get("department"), 140),
        academic_year=clean_text(payload.get("academic_year"), 40),
        semester=clean_text(payload.get("semester"), 40),
        designation=clean_text(payload.get("designation"), 120),
        applicant_note=clean_text(payload.get("note"), 1000),
        id_document=id_document,
    )

    notify(
        university["id"],
        user_id,
        "registration_received",
        "Welcome to Lost & Found Campus — verification pending",
        "Your account was created. An administrator will review your campus identity "
        "documents before sensitive actions such as claims and handovers are enabled.",
        ref_type="user",
        ref_id=user_id,
        email=True,
        email_to=email,
        email_lines=[
            f"Hello {full_name},",
            f"University: {university['name']}",
            f"Campus ID: {campus_id}",
            "Status: Pending verification",
            "Upload or review your ID document from the verification wizard in your dashboard.",
        ],
    )

    admins = pool.query_all(
        "SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.university_id=%s AND r.code='university_admin' AND u.deleted_at IS NULL",
        (university["id"],),
    )
    for admin in admins:
        notify(
            university["id"],
            admin["id"],
            "verification_pending",
            f"New {role['name']} registration awaiting verification",
            f"{full_name} ({campus_id}) submitted a campus identity application.",
            ref_type="user",
            ref_id=user_id,
        )

    return {
        "user_id": user_id,
        "email": email,
        "full_name": full_name,
        "university": {"id": university["id"], "name": university["name"], "code": university["code"]},
        "role": role_code,
        "role_label": role["name"],
        "account_status": "pending",
        "verification_status": verification_status,
        "message": "Account created. Your campus identity is pending administrator verification.",
    }


def authenticate(
    email: str, password: str, university_code: Optional[str] = None, ip: Optional[str] = None
) -> Dict[str, Any]:
    email = (email or "").strip().lower()
    row = pool.query_one(
        """
        SELECT u.*, r.code AS role_code, r.name AS role_name,
               uni.name AS university_name, uni.code AS university_code,
               uni.status AS university_status,
               v.status AS verification_status
        FROM users u
        JOIN roles r ON r.id = u.role_id
        JOIN universities uni ON uni.id = u.university_id
        LEFT JOIN user_verifications v ON v.id = (
            SELECT MAX(v2.id) FROM user_verifications v2 WHERE v2.user_id = u.id
        )
        WHERE u.email = %s AND u.deleted_at IS NULL
        """,
        (email,),
    )
    generic_error = "Email or password is incorrect"
    if not row:
        raise ValueError(generic_error)

    if row.get("locked_until") and row["locked_until"] > datetime.now():
        raise PermissionError(
            "Too many failed attempts. Try again after "
            f"{row['locked_until'].strftime('%H:%M')} or reset your password."
        )

    if not verify_password(password, row["password_hash"]):
        attempts = int(row.get("failed_login_count") or 0) + 1
        lock_until = None
        if attempts >= settings.MAX_LOGIN_ATTEMPTS:
            lock_until = datetime.now() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            attempts = 0
        pool.execute(
            "UPDATE users SET failed_login_count=%s, locked_until=%s WHERE id=%s",
            (attempts, lock_until, row["id"]),
        )
        raise ValueError(generic_error)

    if row["account_status"] in {"suspended", "deactivated"}:
        raise PermissionError(
            f"Your account is {row['account_status']}. Please contact your university administrator."
        )
    if row.get("university_status") == "suspended" and row["role_code"] != "platform_admin":
        raise PermissionError("This university workspace is suspended. Contact the platform administrator.")

    # Bookkeeping only: a failure here must never block a valid sign-in.
    try:
        pool.execute(
            "UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=NOW() WHERE id=%s",
            (row["id"],),
        )
    except Exception as exc:  # pragma: no cover - transient DB contention
        logger.warning("Could not record last_login_at for user %s: %s", row["id"], exc)
    token, expires_in = create_access_token(
        row["id"],
        {
            "role": row["role_code"],
            "uni": row["university_id"],
            "name": row["full_name"],
        },
    )
    from app.deps import user_public

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_public(row),
    }


def request_password_reset(email: str, university_code: Optional[str] = None) -> Dict[str, Any]:
    email = (email or "").strip().lower()
    row = pool.query_one("SELECT * FROM users WHERE email=%s AND deleted_at IS NULL", (email,))
    # Always return the same response shape to avoid account enumeration.
    response = {
        "message": "If that email belongs to an account, a reset link has been sent.",
        "delivery": "email",
    }
    if not row:
        return response

    token = __import__("secrets").token_urlsafe(32)
    pool.execute(
        "INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip) "
        "VALUES (%s,%s,%s,%s)",
        (
            row["id"],
            sha256_hex(token),
            datetime.now() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
            None,
        ),
    )
    reset_url = f"{settings.PUBLIC_BASE_URL}/reset-password?token={token}"
    status, _ = send_email(
        email,
        "Reset your Lost & Found Campus password",
        render_template(
            "Password reset requested",
            [
                f"Hello {row['full_name']},",
                f"Use the link below within {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes:",
                reset_url,
                "",
                "If you did not request this, you can ignore this email.",
            ],
        ),
        university_id=row["university_id"],
    )
    if settings.is_dev:
        response["dev_reset_token"] = token
    response["delivery"] = status
    return response


def reset_password(token: str, new_password: str) -> Dict[str, Any]:
    problems = password_strength_problems(new_password)
    if problems:
        raise ValueError("Password must contain " + ", ".join(problems))
    row = pool.query_one(
        "SELECT * FROM password_resets WHERE token_hash=%s AND used_at IS NULL AND expires_at > NOW()",
        (sha256_hex(token or ""),),
    )
    if not row:
        raise ValueError("This reset link is invalid or has expired")
    pool.execute(
        "UPDATE users SET password_hash=%s, failed_login_count=0, locked_until=NULL WHERE id=%s",
        (hash_password(new_password), row["user_id"]),
    )
    pool.execute("UPDATE password_resets SET used_at=NOW() WHERE id=%s", (row["id"],))
    return {"message": "Password updated. You can now sign in."}


def change_password(user: Dict[str, Any], current: str, new: str) -> Dict[str, Any]:
    if not verify_password(current, user["password_hash"]):
        raise ValueError("Your current password is incorrect")
    problems = password_strength_problems(new)
    if problems:
        raise ValueError("Password must contain " + ", ".join(problems))
    pool.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(new), user["id"]))
    return {"message": "Password changed successfully"}


def update_profile(user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {
        "full_name": 140,
        "phone": 40,
        "department": 140,
        "academic_year": 40,
        "semester": 40,
        "designation": 120,
    }
    updates, params = [], []
    for field, max_len in allowed.items():
        if field in payload:
            updates.append(f"{field}=%s")
            params.append(clean_text(payload.get(field), max_len))
    if not updates:
        return {"message": "Nothing to update"}
    params.append(user["id"])
    pool.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=%s", tuple(params))
    return {"message": "Profile updated"}
