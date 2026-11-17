"""Campus identity verification: applicant flow + administrator review."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.deps import audit, get_current_user, require_university_admin, tenant_id
from app.image_processing.processor import UploadRejected
from app.schemas.models import VerificationReviewPayload
from app.services import verification_service

router = APIRouter(prefix="/api/verifications", tags=["verifications"])


@router.get("/mine")
def my_verification(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    application = verification_service.my_application(user)
    return {
        "application": application,
        "status": (application or {}).get("status", "not_submitted"),
        "steps": [
            {"key": "account", "label": "Account created", "done": True},
            {"key": "role", "label": "Campus role selected", "done": bool(application)},
            {"key": "identity", "label": "Campus identity provided", "done": bool(application)},
            {
                "key": "document",
                "label": "ID card uploaded",
                "done": bool(application and application.get("documents")),
            },
            {
                "key": "review",
                "label": "Administrator verified",
                "done": bool(application and application.get("status") == "verified"),
            },
        ],
    }


@router.post("/documents")
async def upload_document(
    document: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    content = await document.read()
    try:
        result = verification_service.upload_identity_document(
            tenant_id(user), user["id"], content, document.filename or "document"
        )
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "identity_document_uploaded", "user", user["id"], "Identity document uploaded")
    return result


@router.get("/applications")
def list_applications(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    return verification_service.list_applications(tenant_id(user), status=status, page=page, page_size=page_size)


@router.post("/applications/{verification_id}/review")
def review_application(
    verification_id: int,
    payload: VerificationReviewPayload,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    try:
        result = verification_service.review_application(
            tenant_id(user), verification_id, payload.action, user, reason=payload.reason, notes=payload.notes
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(
        user,
        f"verification_{payload.action}",
        "verification",
        verification_id,
        payload.reason or payload.notes or "",
    )
    return result


@router.get("/documents/{document_id}")
def download_document(document_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """
    Private identity document delivery. Requires authentication; permission is
    checked against the document owner and the actor's tenant.
    """
    try:
        row = verification_service.document_for_download(document_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    path = settings.UPLOAD_DIR / row["file_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored document is missing")
    audit(user, "identity_document_viewed", "document", document_id, "Private document access")
    return FileResponse(
        path,
        media_type=row["mime_type"],
        filename=row.get("original_name") or path.name,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
