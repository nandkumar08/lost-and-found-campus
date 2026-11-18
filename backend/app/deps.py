"""
Shared FastAPI dependencies: current user resolution, role guards and
tenant isolation.

Tenant isolation rule: a request's tenant is the authenticated user's
`university_id`, never a client supplied value. Every query in the service
layer filters on that id. Platform admins are the only exception and their
access is explicitly marked in the code path.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database.pool import pool
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

ROLE_CODES = {
    "student",
    "faculty",
    "university_staff",
    "security_personnel",
    "campus_member",
    "university_admin",
    "platform_admin",
}

ROLE_LABELS = {
    "student": "Student",
    "faculty": "Faculty",
    "university_staff": "University Staff",
    "security_personnel": "Security Personnel",
    "campus_member": "Campus Member",
    "university_admin": "University Admin",
    "platform_admin": "Platform Admin",
}

STAFF_ROLES = {"university_admin", "security_personnel"}


def _unauthorized(message: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden(message: str = "You do not have permission to perform this action") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def load_user(user_id: int) -> Optional[Dict[str, Any]]:
    row = pool.query_one(
    """
    SELECT u.*, r.code AS role_code, r.name AS role_name,
           uni.name AS university_name, uni.code AS university_code,
           uni.status AS university_status,
           uni.primary_color, uni.accent_color, uni.logo_path,
           v.status AS verification_status
    FROM users u
    JOIN roles r ON r.id = u.role_id
    JOIN universities uni ON uni.id = u.university_id
    LEFT JOIN (
        SELECT user_id, MAX(id) AS latest_id
        FROM user_verifications
        GROUP BY user_id
    ) latest_v ON latest_v.user_id = u.id
    LEFT JOIN user_verifications v ON v.id = latest_v.latest_id
    WHERE u.id = %s AND u.deleted_at IS NULL
    """,
    (user_id,),
)

    return row


def user_public(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializable user shape (never includes password_hash)."""
    return {
        "id": row["id"],
        "university_id": row["university_id"],
        "university_name": row.get("university_name"),
        "university_code": row.get("university_code"),
        "role": row["role_code"],
        "role_label": row.get("role_name"),
        "full_name": row["full_name"],
        "email": row["email"],
        "phone": row.get("phone"),
        "campus_id_number": row.get("campus_id_number"),
        "department": row.get("department"),
        "academic_year": row.get("academic_year"),
        "semester": row.get("semester"),
        "designation": row.get("designation"),
        "account_status": row["account_status"],
        "verification_status": row.get("verification_status") or "not_submitted",
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
        "last_login_at": row.get("last_login_at").isoformat() if row.get("last_login_at") else None,
    }


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    token = credentials.credentials if credentials else None
    if not token:
        # QR scan / public tracking links may pass ?token= for mobile flows.
        token = request.query_params.get("access_token")
    if not token:
        raise _unauthorized()
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise _unauthorized("Session expired or token invalid")

    user = load_user(int(payload.get("sub", 0)))
    if not user:
        raise _unauthorized("Account no longer exists")
    if user["account_status"] in {"suspended", "deactivated"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user['account_status']}. Please contact your university administrator.",
        )
    if user.get("university_status") == "suspended" and user["role_code"] != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This university's workspace is suspended. Contact the platform administrator.",
        )
    request.state.user = user
    return user


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[Dict[str, Any]]:
    if not credentials:
        return None
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


def require_roles(*roles: str):
    async def dependency(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user["role_code"] not in roles:
            raise _forbidden(
                "This area is restricted to: "
                + ", ".join(ROLE_LABELS.get(r, r) for r in roles)
            )
        return user

    return dependency


def require_verified(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Sensitive actions (claims, handovers) require a verified campus identity."""
    role = user["role_code"]
    if role in {"university_admin", "platform_admin", "security_personnel"}:
        return user
    if (user.get("verification_status") or "") != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your campus identity must be verified before you can perform this action. "
                "Current status: "
                + str(user.get("verification_status") or "not submitted").replace("_", " ")
            ),
        )
    return user


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role_code"] not in {"university_admin", "platform_admin"}:
        raise _forbidden("University administrator access required")
    return user


def require_university_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role_code"] != "university_admin":
        raise _forbidden("University administrator access required")
    return user


def require_platform_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role_code"] != "platform_admin":
        raise _forbidden("Platform administrator access required")
    return user


def require_staff(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """University admin or security personnel."""
    if user["role_code"] not in STAFF_ROLES:
        raise _forbidden("Custody desk or administrator access required")
    return user


def tenant_id(user: Dict[str, Any]) -> int:
    return int(user["university_id"])


def audit(
    user: Optional[Dict[str, Any]],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    detail: Optional[str] = None,
    ip: Optional[str] = None,
    university_id: Optional[int] = None,
) -> None:
    """Append an immutable audit entry (never raises into the request)."""
    try:
        pool.execute(
            """
            INSERT INTO admin_logs
                (university_id, actor_user_id, actor_name, actor_role, action,
                 entity_type, entity_id, detail, ip_address)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                university_id if university_id is not None else (user["university_id"] if user else None),
                user["id"] if user else None,
                user["full_name"] if user else "System",
                ROLE_LABELS.get(user["role_code"], user["role_code"]) if user else "Automated Engine",
                action,
                entity_type,
                str(entity_id) if entity_id is not None else None,
                (detail or "")[:500] or None,
                ip,
            ),
        )
    except Exception:  # pragma: no cover - auditing must never break flows
        pass


def client_ip(request: Request) -> str:
    if settings_trust_proxy():
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def settings_trust_proxy() -> bool:
    from app.config import settings

    return settings.TRUST_PROXY_HEADERS
