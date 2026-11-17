"""Smart match endpoints: suggestions for owners, review queue for staff."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import audit, get_current_user, require_staff, tenant_id
from app.matching.engine import rank_candidates
from app.schemas.models import MatchReviewPayload
from app.services import report_service

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("/mine")
def my_matches(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    items = report_service.matches_for_user(tenant_id(user), user["id"])
    return {"items": items, "total": len(items)}


@router.get("")
def list_matches(
    status: Optional[str] = None,
    confidence: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: Dict[str, Any] = Depends(require_staff),
) -> Dict[str, Any]:
    return report_service.list_matches(
        tenant_id(user), status=status, confidence=confidence, page=page, page_size=page_size
    )


@router.post("/{match_id}/review")
def review_match(
    match_id: int, payload: MatchReviewPayload, user: Dict[str, Any] = Depends(require_staff)
) -> Dict[str, Any]:
    try:
        result = report_service.review_match(
            tenant_id(user), match_id, payload.action, user, notes=payload.notes
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(
        user,
        f"match_{payload.action}ed",
        "match",
        match_id,
        payload.notes or "Match review",
    )
    return result


@router.get("/candidates/{report_id}")
def candidates(
    report_id: int,
    limit: int = Query(default=5, ge=1, le=20),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Live scoring preview for a report (used by the claim screen so a claimant
    can see which custody records are plausible). Only attribute similarity is
    returned — never confidential marks.
    """
    university_id = tenant_id(user)
    report = report_service.get_report_row(report_id, university_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user["role_code"] not in {"university_admin", "security_personnel"} and report.get(
        "reporter_user_id"
    ) != user["id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this report")
    pool_rows = report_service._match_candidates(university_id, report)
    ranked = rank_candidates(report, pool_rows, limit=limit, minimum=25)
    return {
        "report_code": report["report_code"],
        "candidates": [
            {
                "report_id": item["report"]["id"],
                "report_code": item["report"]["report_code"],
                "title": item["report"]["title"],
                "category": item["report"].get("category_name"),
                "location": item["report"].get("location_name") or item["report"].get("location_text"),
                "incident_date": report_service.iso(item["report"].get("incident_date")),
                "score": item["score"],
                "confidence": item["confidence"],
                "reasons": item["reasons"],
                "breakdown": item["breakdown"],
            }
            for item in ranked
        ],
    }
