"""Analytics endpoints (tenant scoped; platform variant for platform admins)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.deps import require_platform_admin, require_university_admin, tenant_id
from app.services import analytics_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/university")
def university_analytics(user: Dict[str, Any] = Depends(require_university_admin)) -> Dict[str, Any]:
    university_id = tenant_id(user)
    return {
        "overview": analytics_service.tenant_overview(university_id),
        "by_category": analytics_service.reports_by_category(university_id),
        "by_location": analytics_service.reports_by_location(university_id),
        "by_status": analytics_service.status_breakdown(university_id),
        "monthly": analytics_service.monthly_trend(university_id),
        "matches": analytics_service.match_performance(university_id),
        "verifications": analytics_service.verification_funnel(university_id),
    }


@router.get("/platform")
def platform_analytics(user: Dict[str, Any] = Depends(require_platform_admin)) -> Dict[str, Any]:
    return analytics_service.platform_overview()
