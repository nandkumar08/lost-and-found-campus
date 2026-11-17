"""University administration, settings, audit logs and platform operations."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.database.pool import pool
from app.deps import (
    audit,
    get_current_user,
    require_platform_admin,
    require_university_admin,
    tenant_id,
    user_public,
)
from app.image_processing.processor import UploadRejected, process_image
from app.notifications.mailer import encrypt_secret
from app.schemas.models import (
    PlatformSettingsPayload,
    UniversityCreatePayload,
    UniversityProfilePayload,
    UniversitySettingsPayload,
    UniversityStatusPayload,
    UserRolePayload,
    UserStatusPayload,
)
from app.security import hash_password, password_strength_problems
from app.services import analytics_service, user_service, verification_service
from app.services.notification_service import notify
from app.utils.helpers import clean_text, iso, paginate, paginated

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard")
def dashboard(user: Dict[str, Any] = Depends(require_university_admin)) -> Dict[str, Any]:
    university_id = tenant_id(user)
    overview = analytics_service.tenant_overview(university_id)
    queue = {
        "verifications": verification_service.list_applications(university_id, status="pending", page_size=5),
        "claims": pool.query_all(
            "SELECT c.id, c.claim_code, c.status, c.created_at, r.report_code, r.title "
            "FROM claims c JOIN reports r ON r.id=c.found_report_id "
            "WHERE c.university_id=%s AND c.status IN ('submitted','under_review','evidence_requested') "
            "ORDER BY c.created_at ASC LIMIT 5",
            (university_id,),
        ),
        "returns": pool.query_all(
            "SELECT ret.id, ret.return_code, ret.status, ret.scheduled_at FROM returns ret "
            "WHERE ret.university_id=%s AND ret.status IN ('scheduled','ready','owner_confirmed') "
            "ORDER BY ret.scheduled_at ASC LIMIT 5",
            (university_id,),
        ),
        "matches": pool.query_all(
            "SELECT m.id, m.score, m.confidence, lr.report_code AS lost_code, fr.report_code AS found_code "
            "FROM matches m JOIN reports lr ON lr.id=m.lost_report_id JOIN reports fr ON fr.id=m.found_report_id "
            "WHERE m.university_id=%s AND m.status='suggested' ORDER BY m.score DESC LIMIT 5",
            (university_id,),
        ),
    }
    for item in queue["claims"] + queue["returns"]:
        item["created_at"] = iso(item.get("created_at"))
        item["scheduled_at"] = iso(item.get("scheduled_at"))
    return {"overview": overview, "queue": queue}


@router.get("/security-dashboard")
def security_dashboard(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role_code"] not in {"security_personnel", "university_admin"}:
        raise HTTPException(status_code=403, detail="Custody desk access required")
    university_id = tenant_id(user)
    custody = pool.query_all(
        "SELECT r.id, r.report_code, r.title, r.status, r.custody_location, r.incident_date, "
        "r.created_at, c.name AS category_name FROM reports r LEFT JOIN categories c ON c.id=r.category_id "
        "WHERE r.university_id=%s AND r.report_type='found' "
        "AND r.status IN ('in_custody','matched','under_review','claim_pending') "
        "AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 25",
        (university_id,),
    )
    for row in custody:
        row["created_at"] = iso(row["created_at"])
        row["incident_date"] = iso(row["incident_date"])
    return {
        "custody_items": custody,
        "stats": {
            "in_custody": pool.scalar(
                "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND report_type='found' "
                "AND status IN ('in_custody','under_review') AND deleted_at IS NULL",
                (university_id,),
                0,
            ),
            "claims_pending": pool.scalar(
                "SELECT COUNT(*) AS c FROM claims WHERE university_id=%s "
                "AND status IN ('submitted','under_review','evidence_requested')",
                (university_id,),
                0,
            ),
            "returns_today": pool.scalar(
                "SELECT COUNT(*) AS c FROM returns WHERE university_id=%s AND DATE(scheduled_at)=CURDATE() "
                "AND status <> 'cancelled'",
                (university_id,),
                0,
            ),
            "handed_over": pool.scalar(
                "SELECT COUNT(*) AS c FROM returns WHERE university_id=%s AND status='completed'",
                (university_id,),
                0,
            ),
        },
        "storage_locations": pool.query_all(
            "SELECT id, name, zone, locker_count FROM locations WHERE university_id=%s AND is_storage=1 "
            "AND deleted_at IS NULL",
            (university_id,),
        ),
        "upcoming_returns": [
            {**row, "scheduled_at": iso(row.get("scheduled_at"))}
            for row in pool.query_all(
                "SELECT ret.id, ret.return_code, ret.status, ret.scheduled_at, l.name AS location, "
                "r.report_code, r.title FROM returns ret JOIN reports r ON r.id=ret.found_report_id "
                "LEFT JOIN locations l ON l.id=ret.collection_location_id "
                "WHERE ret.university_id=%s AND ret.status IN ('scheduled','ready','owner_confirmed') "
                "ORDER BY ret.scheduled_at ASC LIMIT 10",
                (university_id,),
            )
        ],
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
@router.get("/users")
def list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    account_status: Optional[str] = None,
    verification_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    return user_service.list_users(
        tenant_id(user),
        query=q,
        role=role,
        account_status=account_status,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
    )


@router.patch("/users/{user_id}/status")
def set_user_status(
    user_id: int, payload: UserStatusPayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    try:
        result = user_service.set_account_status(tenant_id(user), user_id, payload.account_status, user, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "user_status_changed", "user", user_id, payload.account_status)
    return result


@router.patch("/users/{user_id}/role")
def set_user_role(
    user_id: int, payload: UserRolePayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    try:
        result = user_service.change_role(tenant_id(user), user_id, payload.role, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "user_role_changed", "user", user_id, payload.role)
    return result


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user: Dict[str, Any] = Depends(require_university_admin)) -> Dict[str, Any]:
    try:
        user_service.soft_delete_user(tenant_id(user), user_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "user_deleted", "user", user_id, "Soft deleted")
    return {"message": "User deactivated"}


# ---------------------------------------------------------------------------
# Activity logs
# ---------------------------------------------------------------------------
@router.get("/logs")
def logs(
    q: Optional[str] = None,
    action: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    pg = paginate(page, page_size, 100)
    where = ["university_id = %s"]
    params: list[Any] = [tenant_id(user)]
    if q:
        where.append("(action LIKE %s OR actor_name LIKE %s OR detail LIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like])
    if action:
        where.append("action = %s")
        params.append(action)
    clause = " AND ".join(where)
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM admin_logs WHERE {clause}", tuple(params), 0)
    rows = pool.query_all(
        f"SELECT * FROM admin_logs WHERE {clause} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    items = [
        {
            "id": r["id"],
            "actor": r.get("actor_name"),
            "role": r.get("actor_role"),
            "action": r["action"],
            "entity_type": r.get("entity_type"),
            "entity_id": r.get("entity_id"),
            "detail": r.get("detail"),
            "ip": r.get("ip_address"),
            "at": iso(r.get("created_at")),
        }
        for r in rows
    ]
    return paginated(items, total, pg["page"], pg["page_size"])


# ---------------------------------------------------------------------------
# University settings & branding
# ---------------------------------------------------------------------------
@router.get("/settings")
def get_settings(user: Dict[str, Any] = Depends(require_university_admin)) -> Dict[str, Any]:
    university_id = tenant_id(user)
    university = pool.query_one(
        "SELECT id, name, short_name, code, contact_email, contact_phone, address_line, city, region, "
        "country, primary_color, accent_color, logo_path, status FROM universities WHERE id=%s",
        (university_id,),
    )
    row = pool.query_one("SELECT * FROM university_settings WHERE university_id=%s", (university_id,))
    settings_payload = {}
    if row:
        settings_payload = {
            "verification_mode": row["verification_mode"],
            "allowed_email_domains": row.get("allowed_email_domains"),
            "require_id_upload": bool(row["require_id_upload"]),
            "matching_high_threshold": float(row["matching_high_threshold"]),
            "matching_medium_threshold": float(row["matching_medium_threshold"]),
            "auto_close_days": row["auto_close_days"],
            "max_upload_mb": row["max_upload_mb"],
            "support_email": row.get("support_email"),
            "support_phone": row.get("support_phone"),
            "smtp_host": row.get("smtp_host"),
            "smtp_port": row.get("smtp_port"),
            "smtp_username": row.get("smtp_username"),
            "smtp_from_email": row.get("smtp_from_email"),
            "smtp_use_tls": bool(row.get("smtp_use_tls")),
            "smtp_password_set": bool(row.get("smtp_password_enc")),
        }
    if university and university.get("logo_path"):
        university["logo_url"] = f"/api/uploads/{university['logo_path']}"
    return {"university": university, "settings": settings_payload}


@router.patch("/settings")
def update_settings(
    payload: UniversitySettingsPayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return {"message": "Nothing to update"}

    password = data.pop("smtp_password", None)
    if data.get("matching_high_threshold") is not None and data.get("matching_medium_threshold") is not None:
        if data["matching_medium_threshold"] >= data["matching_high_threshold"]:
            raise HTTPException(status_code=400, detail="Medium threshold must be lower than the high threshold")

    fields, params = [], []
    for key, value in data.items():
        fields.append(f"{key}=%s")
        params.append(int(value) if isinstance(value, bool) else value)
    if password is not None:
        fields.append("smtp_password_enc=%s")
        params.append(encrypt_secret(password))

    existing = pool.query_one("SELECT id FROM university_settings WHERE university_id=%s", (university_id,))
    if existing:
        params.append(university_id)
        pool.execute(f"UPDATE university_settings SET {', '.join(fields)} WHERE university_id=%s", tuple(params))
    else:
        columns = ["university_id"] + [f.split("=")[0] for f in fields]
        placeholders = ",".join(["%s"] * (len(fields) + 1))
        pool.execute(
            f"INSERT INTO university_settings ({', '.join(columns)}) VALUES ({placeholders})",
            tuple([university_id] + params),
        )
    audit(user, "settings_updated", "university", university_id, ", ".join(data.keys()))
    return {"message": "Settings updated"}


@router.patch("/university")
def update_university(
    payload: UniversityProfilePayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return {"message": "Nothing to update"}
    fields = [f"{key}=%s" for key in data]
    params = [clean_text(v, 255) if isinstance(v, str) else v for v in data.values()]
    params.append(tenant_id(user))
    pool.execute(f"UPDATE universities SET {', '.join(fields)} WHERE id=%s", tuple(params))
    audit(user, "university_profile_updated", "university", tenant_id(user), ", ".join(data.keys()))
    return {"message": "University profile updated"}


@router.post("/university/logo")
async def upload_logo(
    logo: UploadFile = File(...), user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    content = await logo.read()
    try:
        meta = process_image(content, logo.filename or "logo.png", "branding")
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pool.execute("UPDATE universities SET logo_path=%s WHERE id=%s", (meta["file_path"], tenant_id(user)))
    audit(user, "university_logo_updated", "university", tenant_id(user), meta["file_path"])
    return {"logo_url": f"/api/uploads/{meta['file_path']}"}


# ---------------------------------------------------------------------------
# Platform administration
# ---------------------------------------------------------------------------
@router.get("/platform/universities")
def platform_universities(user: Dict[str, Any] = Depends(require_platform_admin)) -> Dict[str, Any]:
    rows = pool.query_all(
        "SELECT u.*, (SELECT COUNT(*) FROM users x WHERE x.university_id=u.id AND x.deleted_at IS NULL) AS users, "
        "(SELECT COUNT(*) FROM reports r WHERE r.university_id=u.id AND r.deleted_at IS NULL) AS reports "
        "FROM universities u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC"
    )
    items = []
    for row in rows:
        items.append(
            {
                "id": row["id"],
                "name": row["name"],
                "short_name": row["short_name"],
                "code": row["code"],
                "status": row["status"],
                "contact_email": row["contact_email"],
                "city": row.get("city"),
                "region": row.get("region"),
                "primary_color": row["primary_color"],
                "accent_color": row["accent_color"],
                "users": int(row["users"]),
                "reports": int(row["reports"]),
                "created_at": iso(row.get("created_at")),
                "onboarding_step": row.get("onboarding_step"),
            }
        )
    return {"universities": items, "overview": analytics_service.platform_overview()}


@router.post("/platform/universities", status_code=201)
def create_university(
    payload: UniversityCreatePayload, user: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    code = payload.code.strip().upper()
    if pool.query_one("SELECT id FROM universities WHERE code=%s", (code,)):
        raise HTTPException(status_code=400, detail="A university with that code already exists")
    problems = password_strength_problems(payload.admin_password)
    if problems:
        raise HTTPException(status_code=400, detail="Admin password must contain " + ", ".join(problems))

    university_id = pool.execute(
        """
        INSERT INTO universities
            (name, short_name, code, contact_email, contact_phone, address_line, city, region,
             primary_color, accent_color, status, onboarding_step)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',4)
        """,
        (
            clean_text(payload.name, 180),
            clean_text(payload.short_name, 60),
            code,
            payload.contact_email,
            payload.contact_phone,
            payload.address_line,
            payload.city,
            payload.region,
            payload.primary_color,
            payload.accent_color,
        ),
    )
    pool.execute(
        "INSERT INTO university_settings (university_id, support_email, verification_mode, allowed_email_domains) "
        "VALUES (%s,%s,'admin_manual',%s)",
        (university_id, payload.contact_email, payload.contact_email.split("@")[-1]),
    )
    admin_role = pool.query_one("SELECT id FROM roles WHERE code='university_admin'")
    admin_id = pool.execute(
        """
        INSERT INTO users (university_id, role_id, full_name, email, password_hash, campus_id_number, account_status)
        VALUES (%s,%s,%s,%s,%s,%s,'active')
        """,
        (
            university_id,
            admin_role["id"],
            clean_text(payload.admin_full_name, 140),
            payload.admin_email.lower(),
            hash_password(payload.admin_password),
            f"ADMIN-{code}",
        ),
    )
    if payload.seed_defaults:
        for name, high, order in [
            ("Electronics", 1, 10),
            ("Bags & Luggage", 0, 20),
            ("Accessories & Eyewear", 0, 30),
            ("Keys & Campus ID Cards", 1, 40),
            ("Books & Lab Equipment", 0, 50),
            ("Clothing & Sports Gear", 0, 60),
            ("Documents & Folders", 0, 70),
        ]:
            pool.execute(
                "INSERT IGNORE INTO categories (university_id, name, is_high_value, sort_order) VALUES (%s,%s,%s,%s)",
                (university_id, name, high, order),
            )
        for name, zone, storage, lockers in [
            ("Central Library", "Academic Core", 0, 0),
            ("Central Security Vault", "Main Entrance Plaza", 1, 40),
            ("North Gate Custody Desk", "Main Entrance Plaza", 1, 20),
            ("Science & Engineering Block", "East Campus", 0, 0),
            ("Student Commons", "Student Commons", 0, 0),
            ("Sports Complex", "West Campus", 0, 0),
        ]:
            pool.execute(
                "INSERT IGNORE INTO locations (university_id, name, zone, is_storage, locker_count) VALUES (%s,%s,%s,%s,%s)",
                (university_id, name, zone, storage, lockers),
            )

    audit(user, "university_created", "university", university_id, f"{payload.name} ({code})")
    notify(
        university_id,
        admin_id,
        "welcome_admin",
        "Your university workspace is ready",
        "Sign in with the administrator credentials you configured to verify staff and publish the registry.",
        email=True,
        email_to=payload.admin_email,
    )
    return {
        "university_id": university_id,
        "code": code,
        "admin_user_id": admin_id,
        "message": "University created with default categories and locations",
    }


@router.patch("/platform/universities/{university_id}/status")
def set_university_status(
    university_id: int,
    payload: UniversityStatusPayload,
    user: Dict[str, Any] = Depends(require_platform_admin),
) -> Dict[str, Any]:
    if payload.status not in {"active", "suspended", "pending"}:
        raise HTTPException(status_code=400, detail="Unsupported university status")
    row = pool.query_one("SELECT * FROM universities WHERE id=%s", (university_id,))
    if not row:
        raise HTTPException(status_code=404, detail="University not found")
    pool.execute("UPDATE universities SET status=%s WHERE id=%s", (payload.status, university_id))
    admins = pool.query_all(
        "SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.university_id=%s AND r.code='university_admin'",
        (university_id,),
    )
    for admin in admins:
        notify(
            university_id,
            admin["id"],
            "university_status",
            f"Workspace status: {payload.status}",
            payload.reason or "The platform administrator changed your workspace status.",
            email=True,
            email_to=admin["email"],
        )
    audit(user, f"university_{payload.status}", "university", university_id, payload.reason or "")
    return {"university_id": university_id, "status": payload.status}


@router.get("/platform/analytics")
def platform_analytics(user: Dict[str, Any] = Depends(require_platform_admin)) -> Dict[str, Any]:
    return analytics_service.platform_overview()


@router.get("/platform/settings")
def platform_settings(user: Dict[str, Any] = Depends(require_platform_admin)) -> Dict[str, Any]:
    row = pool.query_one("SELECT * FROM platform_settings WHERE id=1")
    return {
        "settings": {
            "platform_name": row.get("platform_name") if row else "Lost & Found Campus",
            "support_email": row.get("support_email") if row else "",
            "allow_public_reporting": bool(row.get("allow_public_reporting")) if row else True,
            "announcement": row.get("announcement") if row else None,
        }
    }


@router.patch("/platform/settings")
def update_platform_settings(
    payload: PlatformSettingsPayload, user: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return {"message": "Nothing to update"}
    fields = [f"{k}=%s" for k in data]
    params = [int(v) if isinstance(v, bool) else v for v in data.values()]
    pool.execute(f"UPDATE platform_settings SET {', '.join(fields)} WHERE id=1", tuple(params))
    audit(user, "platform_settings_updated", "platform", 1, ", ".join(data.keys()))
    return {"message": "Platform settings updated"}


@router.get("/platform/logs")
def platform_logs(
    page: int = 1,
    page_size: int = 30,
    user: Dict[str, Any] = Depends(require_platform_admin),
) -> Dict[str, Any]:
    pg = paginate(page, page_size, 100)
    total = pool.scalar("SELECT COUNT(*) AS c FROM admin_logs", (), 0)
    rows = pool.query_all(
        "SELECT l.*, u.name AS university_name FROM admin_logs l "
        "LEFT JOIN universities u ON u.id=l.university_id ORDER BY l.created_at DESC, l.id DESC "
        "LIMIT %s OFFSET %s",
        (pg["page_size"], pg["offset"]),
    )
    items = [
        {
            "id": r["id"],
            "university": r.get("university_name"),
            "actor": r.get("actor_name"),
            "role": r.get("actor_role"),
            "action": r["action"],
            "detail": r.get("detail"),
            "at": iso(r.get("created_at")),
        }
        for r in rows
    ]
    return paginated(items, total, pg["page"], pg["page_size"])


# ---------------------------------------------------------------------------
# Email log (SMTP fallback visibility)
# ---------------------------------------------------------------------------
@router.get("/email-log")
def email_log(
    page: int = 1,
    page_size: int = 30,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    pg = paginate(page, page_size, 100)
    where = ["(university_id = %s OR university_id IS NULL)"]
    params: list[Any] = [tenant_id(user)]
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM email_log WHERE {' AND '.join(where)}", tuple(params), 0)
    rows = pool.query_all(
        f"SELECT * FROM email_log WHERE {' AND '.join(where)} ORDER BY created_at DESC LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    items = [
        {
            "id": r["id"],
            "to": r["to_email"],
            "subject": r["subject"],
            "status": r["status"],
            "error": r.get("error"),
            "at": iso(r.get("created_at")),
            "preview": (r.get("body") or "")[:280],
        }
        for r in rows
    ]
    return paginated(items, total, pg["page"], pg["page_size"])
