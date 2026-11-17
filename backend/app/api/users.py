"""Authenticated user profile endpoints."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.deps import audit, get_current_user, user_public
from app.schemas.models import ChangePasswordRequest, ProfileUpdateRequest
from app.services import auth_service
from app.services.verification_service import my_application

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me")
def profile(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    data = user_public(user)
    data["verification"] = my_application(user)
    return data


@router.patch("/me")
def update_profile(
    payload: ProfileUpdateRequest, user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    result = auth_service.update_profile(user, payload.model_dump(exclude_unset=True))
    audit(user, "profile_updated", "user", user["id"], "Profile details updated")
    return result


@router.post("/me/password")
def change_password(
    payload: ChangePasswordRequest, user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    try:
        result = auth_service.change_password(user, payload.current_password, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "password_changed", "user", user["id"], "Password updated from account settings")
    return result
