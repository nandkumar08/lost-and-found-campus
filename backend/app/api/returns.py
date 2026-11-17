"""Collection scheduling, dual confirmation, handover and digital receipts."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.deps import audit, get_current_user, require_staff, tenant_id
from app.schemas.models import ReturnConfirmPayload, ReturnSchedulePayload
from app.services import return_service

router = APIRouter(prefix="/api/returns", tags=["returns"])


@router.post("", status_code=201)
def schedule(
    payload: ReturnSchedulePayload, user: Dict[str, Any] = Depends(require_staff)
) -> Dict[str, Any]:
    try:
        result = return_service.schedule_return(
            tenant_id(user),
            payload.claim_id,
            payload.scheduled_at,
            payload.location_id,
            user,
            instructions=payload.instructions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "return_scheduled", "return", result["return_code"], payload.scheduled_at)
    return result


@router.get("/mine")
def my_returns(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    return return_service.list_returns(
        tenant_id(user), owner_user_id=user["id"], status=status, page=page, page_size=page_size, staff=False
    )


@router.get("")
def list_returns(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(require_staff),
) -> Dict[str, Any]:
    return return_service.list_returns(
        tenant_id(user), status=status, page=page, page_size=page_size, staff=True
    )


@router.post("/{return_id}/confirm")
def confirm(
    return_id: int, payload: ReturnConfirmPayload, user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    try:
        result = return_service.confirm(tenant_id(user), return_id, payload.step, user, notes=payload.notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, f"return_{payload.step}", "return", return_id, payload.notes)
    return result



@router.get("/{return_id}/receipt")
def receipt(return_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    row = return_service.get_return(return_id, tenant_id(user))

    if not row:
        raise HTTPException(status_code=404, detail="Return not found")

    is_staff = user["role_code"] in {
        "university_admin",
        "security_personnel",
    }

    is_participant = (
        row["owner_user_id"] == user["id"]
        or row.get("finder_user_id") == user["id"]
    )

    if not is_staff and not is_participant:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this receipt",
        )

    try:
        return return_service.receipt_data(return_id, tenant_id(user))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
