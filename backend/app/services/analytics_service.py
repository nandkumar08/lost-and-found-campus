"""
Analytics computed live from MySQL. Nothing here is fabricated: every number
is an aggregate over the requesting tenant's rows only.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.database.pool import pool


def _scalar(sql: str, params: tuple = ()) -> int:
    return int(pool.scalar(sql, params, 0) or 0)


def tenant_overview(university_id: int) -> Dict[str, Any]:
    total_reports = _scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND deleted_at IS NULL", (university_id,)
    )
    lost = _scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND report_type='lost' AND deleted_at IS NULL",
        (university_id,),
    )
    found = _scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND report_type='found' AND deleted_at IS NULL",
        (university_id,),
    )
    returned = _scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND status='returned' AND deleted_at IS NULL",
        (university_id,),
    )
    in_custody = _scalar(
        "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND report_type='found' "
        "AND status IN ('in_custody','matched','under_review','claim_pending') AND deleted_at IS NULL",
        (university_id,),
    )
    open_claims = _scalar(
        "SELECT COUNT(*) AS c FROM claims WHERE university_id=%s "
        "AND status IN ('submitted','under_review','evidence_requested')",
        (university_id,),
    )
    scheduled = _scalar(
        "SELECT COUNT(*) AS c FROM returns WHERE university_id=%s "
        "AND status IN ('scheduled','ready','owner_confirmed')",
        (university_id,),
    )
    pending_verifications = _scalar(
        "SELECT COUNT(*) AS c FROM user_verifications WHERE university_id=%s AND status IN ('pending','under_review')",
        (university_id,),
    )
    total_users = _scalar(
        "SELECT COUNT(*) AS c FROM users WHERE university_id=%s AND deleted_at IS NULL", (university_id,)
    )
    verified_users = _scalar(
        "SELECT COUNT(*) AS c FROM users u WHERE u.university_id=%s AND u.deleted_at IS NULL "
        "AND (SELECT v.status FROM user_verifications v WHERE v.user_id=u.id ORDER BY v.id DESC LIMIT 1)='verified'",
        (university_id,),
    )
    high_matches = _scalar(
        "SELECT COUNT(*) AS c FROM matches WHERE university_id=%s AND confidence='high' AND status='suggested'",
        (university_id,),
    )
    recovery_rate = round((returned / total_reports) * 100, 1) if total_reports else 0.0

    return {
        "reports": {"total": total_reports, "lost": lost, "found": found},
        "outcomes": {
            "returned": returned,
            "in_custody": in_custody,
            "recovery_rate_percent": recovery_rate,
        },
        "pipeline": {
            "open_claims": open_claims,
            "scheduled_returns": scheduled,
            "pending_verifications": pending_verifications,
            "unreviewed_high_matches": high_matches,
        },
        "people": {"total_users": total_users, "verified_users": verified_users},
    }


def reports_by_category(university_id: int) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        """
        SELECT COALESCE(c.name,'Uncategorised') AS label, COUNT(*) AS total,
               SUM(r.report_type='lost') AS lost, SUM(r.report_type='found') AS found
        FROM reports r LEFT JOIN categories c ON c.id=r.category_id
        WHERE r.university_id=%s AND r.deleted_at IS NULL
        GROUP BY c.id, c.name ORDER BY total DESC LIMIT 12
        """,
        (university_id,),
    )
    return [
        {"label": r["label"], "total": int(r["total"]), "lost": int(r["lost"] or 0), "found": int(r["found"] or 0)}
        for r in rows
    ]


def reports_by_location(university_id: int) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        """
        SELECT COALESCE(l.name, r.location_text, 'Unspecified') AS label, COUNT(*) AS total
        FROM reports r LEFT JOIN locations l ON l.id=r.location_id
        WHERE r.university_id=%s AND r.deleted_at IS NULL
        GROUP BY l.id, l.name, r.location_text ORDER BY total DESC LIMIT 12
        """,
        (university_id,),
    )
    return [{"label": r["label"], "total": int(r["total"])} for r in rows]


def status_breakdown(university_id: int) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        "SELECT status AS label, COUNT(*) AS total FROM reports WHERE university_id=%s "
        "AND deleted_at IS NULL GROUP BY status ORDER BY total DESC",
        (university_id,),
    )
    return [{"label": r["label"], "total": int(r["total"])} for r in rows]


def monthly_trend(university_id: int, months: int = 6) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        """
        SELECT DATE_FORMAT(created_at, '%%Y-%%m') AS bucket,
               SUM(report_type='lost') AS lost, SUM(report_type='found') AS found,
               COUNT(*) AS total
        FROM reports
        WHERE university_id=%s AND deleted_at IS NULL
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        GROUP BY bucket ORDER BY bucket ASC
        """,
        (university_id, months),
    )
    return [
        {
            "month": r["bucket"],
            "lost": int(r["lost"] or 0),
            "found": int(r["found"] or 0),
            "total": int(r["total"] or 0),
        }
        for r in rows
    ]


def match_performance(university_id: int) -> Dict[str, Any]:
    rows = pool.query_all(
        "SELECT confidence, status, COUNT(*) AS total, AVG(score) AS avg_score FROM matches "
        "WHERE university_id=%s GROUP BY confidence, status",
        (university_id,),
    )
    by_confidence = {"high": 0, "medium": 0, "low": 0}
    by_status = {"suggested": 0, "confirmed": 0, "rejected": 0, "closed": 0}
    total = 0
    weighted = 0.0
    for row in rows:
        count = int(row["total"])
        total += count
        by_confidence[row["confidence"]] = by_confidence.get(row["confidence"], 0) + count
        by_status[row["status"]] = by_status.get(row["status"], 0) + count
        weighted += float(row["avg_score"] or 0) * count
    return {
        "total_matches": total,
        "average_score": round(weighted / total, 1) if total else 0.0,
        "by_confidence": by_confidence,
        "by_status": by_status,
    }


def verification_funnel(university_id: int) -> List[Dict[str, Any]]:
    rows = pool.query_all(
        "SELECT status AS label, COUNT(*) AS total FROM user_verifications WHERE university_id=%s "
        "GROUP BY status",
        (university_id,),
    )
    return [{"label": r["label"], "total": int(r["total"])} for r in rows]


def platform_overview() -> Dict[str, Any]:
    universities = pool.query_all(
        "SELECT id, name, code, status, created_at FROM universities WHERE deleted_at IS NULL ORDER BY name"
    )
    totals = []
    for university in universities:
        uid = university["id"]
        totals.append(
            {
                "id": uid,
                "name": university["name"],
                "code": university["code"],
                "status": university["status"],
                "users": _scalar("SELECT COUNT(*) AS c FROM users WHERE university_id=%s AND deleted_at IS NULL", (uid,)),
                "reports": _scalar("SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND deleted_at IS NULL", (uid,)),
                "returned": _scalar(
                    "SELECT COUNT(*) AS c FROM reports WHERE university_id=%s AND status='returned' AND deleted_at IS NULL",
                    (uid,),
                ),
                "pending_verifications": _scalar(
                    "SELECT COUNT(*) AS c FROM user_verifications WHERE university_id=%s AND status IN ('pending','under_review')",
                    (uid,),
                ),
            }
        )
    return {
        "universities": totals,
        "totals": {
            "universities": len(totals),
            "active_universities": sum(1 for t in totals if t["status"] == "active"),
            "users": sum(t["users"] for t in totals),
            "reports": sum(t["reports"] for t in totals),
            "returned": sum(t["returned"] for t in totals),
        },
    }
