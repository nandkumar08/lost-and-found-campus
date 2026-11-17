"""Ownership claims, evidence and officer review."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.deps import audit, get_current_user, require_staff, require_verified, tenant_id
from app.image_processing.processor import UploadRejected
from app.schemas.models import ClaimReviewPayload
from app.services import claim_service
from app.services.report_service import serialize_public, get_report_row, _images_for

router = APIRouter(prefix="/api/claims", tags=["claims"])


@router.post("", status_code=201)
async def submit_claim(
    found_report_id: int = Form(...),
    identifying_answer: str = Form(...),
    lost_report_id: Optional[int] = Form(default=None),
    match_id: Optional[int] = Form(default=None),
    evidence_note: Optional[str] = Form(default=None),
    evidence: List[UploadFile] = File(default=[]),
    user: Dict[str, Any] = Depends(require_verified),
) -> Dict[str, Any]:
    files = []
    for upload in evidence[:4]:
        if upload and upload.filename:
            files.append((await upload.read(), upload.filename))
    try:
        result = claim_service.submit_claim(
            university_id=tenant_id(user),
            claimant=user,
            found_report_id=found_report_id,
            identifying_answer=identifying_answer,
            lost_report_id=lost_report_id,
            match_id=match_id,
            evidence_files=files,
            evidence_note=evidence_note,
        )
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "claim_submitted", "claim", result["claim_code"], "Ownership claim filed")
    return result


@router.get("/mine")
def my_claims(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    return claim_service.list_claims(
        tenant_id(user), status=status, claimant_user_id=user["id"], page=page, page_size=page_size, staff=False
    )


@router.get("")
def list_claims(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(require_staff),
) -> Dict[str, Any]:
    return claim_service.list_claims(
        tenant_id(user), status=status, page=page, page_size=page_size, staff=True
    )


@router.get("/claimable/{report_id}")
def claimable_context(report_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Attribute-only view of a found item plus the options needed to claim it."""
    row = get_report_row(report_id, tenant_id(user))
    if not row or row["report_type"] != "found":
        raise HTTPException(status_code=404, detail="Found report not found")
    if row["status"] in {"returned", "closed", "archived"}:
        raise HTTPException(status_code=400, detail="This item is no longer claimable")
    from app.database.pool import pool

    already = pool.query_one(
        "SELECT claim_code, status FROM claims WHERE found_report_id=%s AND claimant_user_id=%s",
        (report_id, user["id"]),
    )
    my_lost = pool.query_all(
        "SELECT id, report_code, title, status FROM reports WHERE university_id=%s AND report_type='lost' "
        "AND reporter_user_id=%s AND deleted_at IS NULL AND status NOT IN ('returned','closed','archived')",
        (tenant_id(user), user["id"]),
    )
    return {
        "report": serialize_public(row, _images_for([report_id]).get(report_id, [])),
        "existing_claim": already,
        "my_lost_reports": [
            {"id": r["id"], "report_code": r["report_code"], "title": r["title"], "status": r["status"]}
            for r in my_lost
        ],
        "requirements": [
            "Describe a private identifying detail that is not shown publicly",
            "Optional supporting evidence (photo of receipt, serial number, previous photo)",
            "Verification is completed by a campus officer — a match alone is not proof",
        ],
    }


@router.get("/{claim_id}")
def claim_detail(claim_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    claim = claim_service.get_claim(claim_id, tenant_id(user))
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    is_staff = user["role_code"] in {"university_admin", "security_personnel"}
    if not is_staff and claim["claimant_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this claim")
    evidence = claim_service._evidence_for([claim_id]).get(claim_id, [])
    return claim_service.serialize_claim(claim, evidence, staff=is_staff, viewer_id=user["id"])


@router.post("/{claim_id}/review")
def review_claim(
    claim_id: int, payload: ClaimReviewPayload, user: Dict[str, Any] = Depends(require_staff)
) -> Dict[str, Any]:
    try:
        result = claim_service.review_claim(
            tenant_id(user),
            claim_id,
            payload.action,
            user,
            reason=payload.reason,
            notes=payload.notes,
            verification_method=payload.verification_method,
            findings=payload.findings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, f"claim_{payload.action}", "claim", claim_id, payload.reason or payload.notes)
    return result


@router.post("/{claim_id}/evidence")
async def upload_evidence(
    claim_id: int,
    note: Optional[str] = Form(default=None),
    files: List[UploadFile] = File(default=[]),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    payload = []
    for upload in files[:4]:
        if upload and upload.filename:
            payload.append((await upload.read(), upload.filename))
    try:
        count = claim_service.add_evidence(tenant_id(user), claim_id, user, payload, note=note)
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(user, "claim_evidence_uploaded", "claim", claim_id, f"{count} file(s)")
    return {"message": f"{count} file(s) uploaded", "count": count}


@router.post("/{claim_id}/cancel")
def cancel_claim(claim_id: int, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        claim_service.cancel_claim(tenant_id(user), claim_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Claim cancelled"}


@router.get("/evidence/{evidence_id}")
def download_evidence(evidence_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Private evidence download: owner of the claim, officer or admin only."""
    from app.database.pool import pool

    row = pool.query_one(
        "SELECT e.*, c.claimant_user_id, c.university_id FROM claim_evidence e "
        "JOIN claims c ON c.id=e.claim_id WHERE e.id=%s AND e.deleted_at IS NULL",
        (evidence_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if row["university_id"] != user["university_id"] and user["role_code"] != "platform_admin":
        raise HTTPException(status_code=403, detail="This evidence belongs to another university")
    if user["role_code"] not in {"university_admin", "security_personnel"} and row[
        "claimant_user_id"
    ] != user["id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this evidence")
    path = settings.UPLOAD_DIR / row["file_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file is missing")
    return FileResponse(path, media_type=row["mime_type"], filename=row.get("original_name") or path.name)
