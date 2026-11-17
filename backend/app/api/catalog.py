"""Categories and campus locations (public read, admin manage)."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.pool import pool
from app.deps import audit, require_university_admin, tenant_id
from app.schemas.models import CategoryPayload, LocationPayload
from app.services.auth_service import get_university
from app.utils.helpers import clean_text, iso

router = APIRouter(prefix="/api", tags=["catalog"])


def _resolve_university(university_code: Optional[str], user: Optional[Dict[str, Any]]) -> int:
    if user:
        return tenant_id(user)
    university = get_university(code=university_code) if university_code else get_university()
    if not university:
        raise HTTPException(status_code=404, detail="University not found")
    return university["id"]


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@router.get("/categories")
def list_categories(
    university_code: Optional[str] = None,
    include_inactive: bool = Query(default=False),
) -> Dict[str, Any]:
    university_id = _resolve_university(university_code, None)
    sql = (
        "SELECT c.*, (SELECT COUNT(*) FROM reports r WHERE r.category_id=c.id AND r.deleted_at IS NULL) AS report_count "
        "FROM categories c WHERE c.university_id=%s AND c.deleted_at IS NULL"
    )
    if not include_inactive:
        sql += " AND c.is_active=1"
    sql += " ORDER BY c.sort_order ASC, c.name ASC"
    rows = pool.query_all(sql, (university_id,))
    return {
        "categories": [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description"),
                "is_high_value": bool(r["is_high_value"]),
                "is_active": bool(r["is_active"]),
                "sort_order": r["sort_order"],
                "report_count": int(r.get("report_count") or 0),
            }
            for r in rows
        ]
    }


@router.post("/categories", status_code=201)
def create_category(
    payload: CategoryPayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    name = clean_text(payload.name, 100)
    exists = pool.query_one(
        "SELECT id FROM categories WHERE university_id=%s AND name=%s AND deleted_at IS NULL",
        (university_id, name),
    )
    if exists:
        raise HTTPException(status_code=400, detail="That category already exists")
    category_id = pool.execute(
        "INSERT INTO categories (university_id, name, description, is_high_value, is_active, sort_order) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (
            university_id,
            name,
            clean_text(payload.description, 255),
            int(payload.is_high_value),
            int(payload.is_active),
            payload.sort_order,
        ),
    )
    audit(user, "category_created", "category", category_id, name)
    return {"id": category_id, "name": name}


@router.patch("/categories/{category_id}")
def update_category(
    category_id: int,
    payload: CategoryPayload,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    row = pool.query_one(
        "SELECT id FROM categories WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
        (category_id, university_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    pool.execute(
        "UPDATE categories SET name=%s, description=%s, is_high_value=%s, is_active=%s, sort_order=%s "
        "WHERE id=%s AND university_id=%s",
        (
            clean_text(payload.name, 100),
            clean_text(payload.description, 255),
            int(payload.is_high_value),
            int(payload.is_active),
            payload.sort_order,
            category_id,
            university_id,
        ),
    )
    audit(user, "category_updated", "category", category_id, payload.name)
    return {"id": category_id, "message": "Category updated"}


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    used = pool.scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE category_id=%s AND deleted_at IS NULL",
        (category_id,),
        0,
    )
    if used:
        pool.execute(
            "UPDATE categories SET is_active=0, deleted_at=NOW() WHERE id=%s AND university_id=%s",
            (category_id, university_id),
        )
    else:
        pool.execute(
            "UPDATE categories SET deleted_at=NOW() WHERE id=%s AND university_id=%s",
            (category_id, university_id),
        )
    audit(user, "category_deleted", "category", category_id, "Soft deleted")
    return {"message": "Category removed"}


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------
@router.get("/locations")
def list_locations(
    university_code: Optional[str] = None,
    storage_only: bool = False,
    include_inactive: bool = False,
) -> Dict[str, Any]:
    university_id = _resolve_university(university_code, None)
    sql = "SELECT * FROM locations WHERE university_id=%s AND deleted_at IS NULL"
    params: list[Any] = [university_id]
    if storage_only:
        sql += " AND is_storage=1"
    if not include_inactive:
        sql += " AND is_active=1"
    sql += " ORDER BY zone ASC, name ASC"
    rows = pool.query_all(sql, tuple(params))
    return {
        "locations": [
            {
                "id": r["id"],
                "name": r["name"],
                "zone": r.get("zone"),
                "description": r.get("description"),
                "is_storage": bool(r["is_storage"]),
                "locker_count": r["locker_count"],
                "is_active": bool(r["is_active"]),
                "created_at": iso(r.get("created_at")),
            }
            for r in rows
        ]
    }


@router.post("/locations", status_code=201)
def create_location(
    payload: LocationPayload, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    name = clean_text(payload.name, 140)
    exists = pool.query_one(
        "SELECT id FROM locations WHERE university_id=%s AND name=%s AND deleted_at IS NULL",
        (university_id, name),
    )
    if exists:
        raise HTTPException(status_code=400, detail="That location already exists")
    location_id = pool.execute(
        "INSERT INTO locations (university_id, name, zone, description, is_storage, locker_count, is_active) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (
            university_id,
            name,
            clean_text(payload.zone, 120),
            clean_text(payload.description, 255),
            int(payload.is_storage),
            payload.locker_count,
            int(payload.is_active),
        ),
    )
    audit(user, "location_created", "location", location_id, name)
    return {"id": location_id, "name": name}


@router.patch("/locations/{location_id}")
def update_location(
    location_id: int,
    payload: LocationPayload,
    user: Dict[str, Any] = Depends(require_university_admin),
) -> Dict[str, Any]:
    university_id = tenant_id(user)
    row = pool.query_one(
        "SELECT id FROM locations WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
        (location_id, university_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Location not found")
    pool.execute(
        "UPDATE locations SET name=%s, zone=%s, description=%s, is_storage=%s, locker_count=%s, is_active=%s "
        "WHERE id=%s AND university_id=%s",
        (
            clean_text(payload.name, 140),
            clean_text(payload.zone, 120),
            clean_text(payload.description, 255),
            int(payload.is_storage),
            payload.locker_count,
            int(payload.is_active),
            location_id,
            university_id,
        ),
    )
    audit(user, "location_updated", "location", location_id, payload.name)
    return {"id": location_id, "message": "Location updated"}


@router.delete("/locations/{location_id}")
def delete_location(
    location_id: int, user: Dict[str, Any] = Depends(require_university_admin)
) -> Dict[str, Any]:
    pool.execute(
        "UPDATE locations SET deleted_at=NOW(), is_active=0 WHERE id=%s AND university_id=%s",
        (location_id, tenant_id(user)),
    )
    audit(user, "location_deleted", "location", location_id, "Soft deleted")
    return {"message": "Location removed"}
