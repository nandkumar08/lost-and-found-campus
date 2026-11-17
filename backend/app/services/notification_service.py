"""In-app + email notification service."""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

from app.database.pool import pool
from app.notifications.mailer import render_template, send_email
from app.utils.helpers import iso

logger = logging.getLogger("lfc.notify")


def notify(
    university_id: int,
    user_id: Optional[int],
    type_: str,
    title: str,
    body: str = "",
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    email: bool = False,
    email_to: Optional[str] = None,
    email_lines: Optional[Iterable[str]] = None,
) -> Optional[int]:
    channel = "both" if email else "in_app"
    notification_id = pool.execute(
        """
        INSERT INTO notifications
            (university_id, user_id, email_to, channel, type, title, body, ref_type, ref_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (university_id, user_id, email_to, channel, type_, title[:200], body, ref_type, ref_id and str(ref_id)),
    )
    if email and email_to:
        status, error = send_email(
            email_to,
            title,
            render_template(title, list(email_lines or [body])),
            university_id=university_id,
        )
        try:
            pool.execute(
                "UPDATE notifications SET email_status=%s, email_error=%s WHERE id=%s",
                (status if status != "logged_only" else "queued", (error or "")[:255] or None, notification_id),
            )
        except Exception:  # pragma: no cover
            pass
    return notification_id


def notify_many(
    university_id: int,
    user_ids: Iterable[int],
    type_: str,
    title: str,
    body: str = "",
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
) -> int:
    count = 0
    for user_id in set(user_ids):
        notify(university_id, user_id, type_, title, body, ref_type, ref_id)
        count += 1
    return count


def list_notifications(
    university_id: int, user_id: int, only_unread: bool = False, page: int = 1, page_size: int = 20
) -> Dict[str, Any]:
    where = "university_id = %s AND user_id = %s"
    params: list[Any] = [university_id, user_id]
    if only_unread:
        where += " AND is_read = 0"
    total = pool.scalar(f"SELECT COUNT(*) AS c FROM notifications WHERE {where}", tuple(params), 0)
    rows = pool.query_all(
        f"""
        SELECT id, type, title, body, ref_type, ref_id, is_read, email_status, created_at
        FROM notifications WHERE {where}
        ORDER BY created_at DESC, id DESC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [page_size, (page - 1) * page_size]),
    )
    items = [
        {
            "id": row["id"],
            "type": row["type"],
            "title": row["title"],
            "body": row["body"],
            "ref_type": row["ref_type"],
            "ref_id": row["ref_id"],
            "unread": not bool(row["is_read"]),
            "email_status": row["email_status"],
            "date": iso(row["created_at"]),
        }
        for row in rows
    ]
    unread = pool.scalar(
        "SELECT COUNT(*) AS c FROM notifications WHERE university_id=%s AND user_id=%s AND is_read=0",
        (university_id, user_id),
        0,
    )
    return {"items": items, "total": total, "unread": unread, "page": page, "page_size": page_size}


def mark_read(university_id: int, user_id: int, notification_id: int) -> bool:
    affected = pool.execute(
        "UPDATE notifications SET is_read=1, read_at=NOW() "
        "WHERE id=%s AND university_id=%s AND user_id=%s AND is_read=0",
        (notification_id, university_id, user_id),
    )
    return bool(affected)


def mark_all_read(university_id: int, user_id: int) -> int:
    return pool.execute(
        "UPDATE notifications SET is_read=1, read_at=NOW() "
        "WHERE university_id=%s AND user_id=%s AND is_read=0",
        (university_id, user_id),
    )
