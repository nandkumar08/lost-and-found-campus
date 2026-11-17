"""In-app notification centre."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, tenant_id
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    return notification_service.list_notifications(
        tenant_id(user), user["id"], only_unread=unread_only, page=page, page_size=max(1, min(page_size, 100))
    )


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    ok = notification_service.mark_read(tenant_id(user), user["id"], notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found or already read")
    return {"message": "Marked as read"}


@router.post("/read-all")
def mark_all(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    count = notification_service.mark_all_read(tenant_id(user), user["id"])
    return {"message": f"{count} notification(s) marked read", "count": count}
