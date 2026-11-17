"""Authentication, registration and password recovery endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError

from app.deps import audit, client_ip, get_current_user, user_public
from app.image_processing.processor import UploadRejected
from app.schemas.models import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.config import settings
from app.security import rate_limiter
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/universities")
def universities() -> Dict[str, Any]:
    return {"universities": auth_service.list_universities()}


@router.get("/roles")
def roles() -> Dict[str, Any]:
    from app.deps import ROLE_LABELS

    self_register = ["student", "faculty", "university_staff", "security_personnel", "campus_member"]
    return {
        "roles": [
            {"code": code, "label": ROLE_LABELS[code], "self_registration": code in self_register}
            for code in ROLE_LABELS
        ]
    }


@router.post("/register", status_code=201)
async def register(
    request: Request,
    university_code: Optional[str] = Form(default=None),
    university_id: Optional[int] = Form(default=None),
    role: str = Form(...),
    full_name: str = Form(...),
    email: str = Form(...),
    phone: Optional[str] = Form(default=None),
    password: str = Form(...),
    confirm_password: str = Form(...),
    campus_id_number: str = Form(...),
    department: Optional[str] = Form(default=None),
    academic_year: Optional[str] = Form(default=None),
    semester: Optional[str] = Form(default=None),
    designation: Optional[str] = Form(default=None),
    note: Optional[str] = Form(default=None),
    id_document: Optional[UploadFile] = File(default=None),
) -> Dict[str, Any]:
    ip = client_ip(request)
    allowed, retry = rate_limiter.check(f"register:{ip}", "8/hour")
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many registrations. Retry in {retry}s.")

    try:
        payload = RegisterRequest(
            university_code=university_code,
            university_id=university_id,
            role=role,
            full_name=full_name,
            email=email,
            phone=phone or None,
            password=password,
            confirm_password=confirm_password,
            campus_id_number=campus_id_number,
            department=department,
            academic_year=academic_year,
            semester=semester,
            designation=designation,
            note=note,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()[0]["msg"])

    id_doc = None
    if id_document is not None:
        if id_document.filename:
            content = await id_document.read()
            id_doc = (content, id_document.filename)

    try:
        result = auth_service.register_user(payload.model_dump(), id_document=id_doc, ip=ip)
    except (ValueError, UploadRejected) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    audit(
        None,
        "user_registered",
        "user",
        result["user_id"],
        f"{result['full_name']} registered as {result['role']}",
        ip=ip,
        university_id=result["university"]["id"],
    )
    return result


@router.post("/login")
def login(payload: LoginRequest, request: Request) -> Dict[str, Any]:
    ip = client_ip(request)
    allowed, retry = rate_limiter.check(f"login:{ip}", settings.RATE_LIMIT_LOGIN)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many sign-in attempts. Please retry in {retry} seconds.",
            headers={"Retry-After": str(retry)},
        )
    try:
        result = auth_service.authenticate(
            payload.email, payload.password, payload.university_code, ip=ip
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    # A successful sign-in clears the throttle so legitimate users are never
    # locked out by their own earlier successful attempts.
    rate_limiter.reset(f"login:{ip}")
    audit(
        {"id": result["user"]["id"], "full_name": result["user"]["full_name"], "role_code": result["user"]["role"], "university_id": result["user"]["university_id"]},
        "login",
        "user",
        result["user"]["id"],
        "Signed in",
        ip=ip,
    )
    return result


@router.get("/me")
def me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    data = user_public(user)
    from app.database.pool import pool

    data["permissions"] = _permissions(user)
    data["university"] = pool.query_one(
        "SELECT id, name, short_name, code, primary_color, accent_color, contact_email, "
        "contact_phone, logo_path, status FROM universities WHERE id=%s",
        (user["university_id"],),
    )
    data["counters"] = {
        "unread_notifications": pool.scalar(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id=%s AND is_read=0", (user["id"],), 0
        )
    }
    return data


def _permissions(user: Dict[str, Any]) -> List[str]:
    role = user["role_code"]
    perms = ["report:create", "report:track", "profile:manage"]
    if role in {"student", "faculty", "university_staff", "campus_member"}:
        perms += ["claim:create", "claim:view_own", "return:view_own"]
    if role in {"security_personnel", "university_admin"}:
        perms += [
            "custody:intake",
            "custody:scan",
            "claim:review",
            "match:review",
            "return:manage",
            "reports:view_all",
        ]
    if role == "university_admin":
        perms += [
            "users:manage",
            "verification:review",
            "settings:manage",
            "logs:view",
            "analytics:view",
        ]
    if role == "platform_admin":
        perms += ["platform:manage", "analytics:view", "platform:universities"]
    return perms


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request) -> Dict[str, Any]:
    ip = client_ip(request)
    allowed, retry = rate_limiter.check(f"forgot:{ip}", "6/hour")
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many requests. Retry in {retry}s.")
    return auth_service.request_password_reset(payload.email, payload.university_code)


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request) -> Dict[str, Any]:
    ip = client_ip(request)
    allowed, retry = rate_limiter.check(f"reset:{ip}", "10/hour")
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many requests. Retry in {retry}s.")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    try:
        result = auth_service.reset_password(payload.token, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(None, "password_reset_completed", "user", None, "Password reset via email token", ip=ip)
    return result
