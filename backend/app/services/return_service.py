"""Peer-to-peer item return scheduling, dual confirmation and digital receipts."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.database.pool import pool
from app.qr.generator import create_qr
from app.services.notification_service import notify
from app.services.report_service import record_status_event
from app.utils.helpers import clean_text, generate_return_code, iso, paginate, paginated


RETURN_SELECT = """
    SELECT ret.*, c.claim_code, c.claimant_user_id,
           fr.report_code AS found_code, fr.title AS item_title, fr.report_type,
           fr.reporter_user_id AS finder_user_id,
           loc.name AS collection_location, loc.zone AS collection_zone,
           owner.full_name AS owner_name, owner.email AS owner_email,
           finder.full_name AS finder_name, finder.email AS finder_email,
           officer.full_name AS officer_name
    FROM returns ret
    JOIN claims c ON c.id = ret.claim_id
    JOIN reports fr ON fr.id = ret.found_report_id
    LEFT JOIN locations loc ON loc.id = ret.collection_location_id
    JOIN users owner ON owner.id = ret.owner_user_id
    LEFT JOIN users finder ON finder.id = fr.reporter_user_id
    LEFT JOIN users officer ON officer.id = ret.security_officer_id
"""


def serialize_return(row: Dict[str, Any], staff: bool = False) -> Dict[str, Any]:
    data = {
        "id": row["id"],
        "return_code": row["return_code"],
        "status": row["status"],
        "status_label": row["status"].replace("_", " ").title(),
        "scheduled_at": iso(row.get("scheduled_at")),
        "collection_location": row.get("collection_location"),
        "collection_zone": row.get("collection_zone"),
        "collection_instructions": row.get("collection_instructions"),
        "owner_confirmed_at": iso(row.get("owner_confirmed_at")),
        "finder_confirmed_at": iso(row.get("finder_confirmed_at")),
        "handover_confirmed_at": iso(row.get("handover_confirmed_at")),
        "receipt_number": row.get("receipt_number"),
        "claim_code": row.get("claim_code"),
        "found_report": {
            "report_code": row.get("found_code"),
            "title": row.get("item_title"),
        },
        "owner_name": row.get("owner_name"),
        "finder_name": row.get("finder_name"),
        "officer_name": row.get("officer_name"),
        "notes": row.get("notes"),
        "created_at": iso(row.get("created_at")),
    }
    if staff:
        data.update({
            "owner_email": row.get("owner_email"),
            "finder_email": row.get("finder_email"),
        })
    return data


def get_return(return_id: int, university_id: int) -> Optional[Dict[str, Any]]:
    return pool.query_one(
        RETURN_SELECT + " WHERE ret.id=%s AND ret.university_id=%s",
        (return_id, university_id),
    )


def schedule_return(
    university_id: int,
    claim_id: int,
    scheduled_at: str,
    location_id: Optional[int],
    actor: Dict[str, Any],
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    claim = pool.query_one(
        "SELECT * FROM claims WHERE id=%s AND university_id=%s",
        (claim_id, university_id),
    )
    if not claim:
        raise ValueError("Claim not found")
    if claim["status"] != "approved":
        raise ValueError("Only approved claims can be scheduled for a meetup")

    found_report = pool.query_one(
        "SELECT id, reporter_user_id FROM reports WHERE id=%s AND university_id=%s",
        (claim["found_report_id"], university_id),
    )
    if not found_report or not found_report.get("reporter_user_id"):
        raise ValueError("The finder account for this found report could not be identified")

    finder_user_id = found_report["reporter_user_id"]
    owner_user_id = claim["claimant_user_id"]
    if finder_user_id == owner_user_id:
        raise ValueError("Finder and owner must be different accounts")

    existing = pool.query_one(
        "SELECT id FROM returns WHERE claim_id=%s AND status NOT IN ('cancelled','completed')",
        (claim_id,),
    )
    if existing:
        raise ValueError("A meetup is already scheduled for this claim")

    try:
        when = datetime.fromisoformat(scheduled_at.replace("Z", "").strip())
    except ValueError:
        raise ValueError("scheduled_at must be an ISO date-time, e.g. 2026-11-20T15:30")
    if when < datetime.now() - timedelta(minutes=5):
        raise ValueError("Meetup must be scheduled in the future")

    if location_id:
        valid = pool.query_one(
            "SELECT id FROM locations WHERE id=%s AND university_id=%s AND deleted_at IS NULL",
            (location_id, university_id),
        )
        if not valid:
            raise ValueError("The selected meetup location is not available")

    return_code = generate_return_code()
    return_id = pool.execute(
        """
        INSERT INTO returns
            (university_id, return_code, claim_id, found_report_id, owner_user_id,
             scheduled_at, collection_location_id, collection_instructions, status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'scheduled')
        """,
        (
            university_id, return_code, claim_id, claim["found_report_id"],
            owner_user_id, when, location_id, clean_text(instructions, 400),
        ),
    )

    pool.execute(
        "UPDATE reports SET status='return_scheduled' WHERE id=%s AND university_id=%s",
        (claim["found_report_id"], university_id),
    )
    record_status_event(
        university_id,
        claim["found_report_id"],
        "return_scheduled",
        note=f"Campus meetup scheduled for {when.strftime('%d %b %Y %H:%M')} ({return_code})",
        actor_user_id=actor["id"],
        is_public=True,
    )

    location = pool.query_one(
        "SELECT name, zone FROM locations WHERE id=%s AND university_id=%s",
        (location_id, university_id),
    ) if location_id else None
    location_text = location["name"] if location else "the agreed campus location"
    if location and location.get("zone"):
        location_text += f" ({location['zone']})"

    owner = pool.query_one(
        "SELECT id, email FROM users WHERE id=%s", (owner_user_id,)
    )
    finder = pool.query_one(
        "SELECT id, email FROM users WHERE id=%s", (finder_user_id,)
    )
    meetup_text = (
        f"Meet on campus on {when.strftime('%d %b %Y at %H:%M')} at {location_text}. "
        f"Instructions: {clean_text(instructions, 400) or 'Meet at the selected location.'} "
        "The owner and finder must each confirm the physical exchange from their own account."
    )

    for participant, kind in ((owner, "owner"), (finder, "finder")):
        if participant:
            notify(
                university_id,
                participant["id"],
                "return_scheduled",
                f"Campus handover scheduled — {return_code}",
                meetup_text,
                ref_type="return",
                ref_id=return_code,
                email=True,
                email_to=participant.get("email"),
                email_lines=[
                    f"Return reference: {return_code}",
                    f"Meetup: {when.strftime('%d %b %Y at %H:%M')}",
                    f"Location: {location_text}",
                    f"Role: {kind.title()}",
                    "After exchanging the item, confirm the handover in your own account.",
                    "The digital receipt is generated only after both students confirm.",
                ],
            )

    row = get_return(return_id, university_id)
    return serialize_return(row, staff=True)


def list_returns(
    university_id: int,
    owner_user_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    staff: bool = True,
) -> Dict[str, Any]:
    pg = paginate(page, page_size)
    where = ["ret.university_id = %s"]
    params: list[Any] = [university_id]

    if owner_user_id:
        where.append("(ret.owner_user_id = %s OR fr.reporter_user_id = %s)")
        params.extend([owner_user_id, owner_user_id])
    if status:
        where.append("ret.status = %s")
        params.append(status)

    clause = " AND ".join(where)
    from_clause = " FROM returns ret JOIN reports fr ON fr.id = ret.found_report_id "
    total = pool.scalar(
        f"SELECT COUNT(*) AS c{from_clause} WHERE {clause}",
        tuple(params),
        0,
    )
    rows = pool.query_all(
        RETURN_SELECT + f" WHERE {clause} ORDER BY ret.scheduled_at DESC LIMIT %s OFFSET %s",
        tuple(params + [pg["page_size"], pg["offset"]]),
    )
    return paginated(
        [serialize_return(row, staff=staff) for row in rows],
        total,
        pg["page"],
        pg["page_size"],
    )


def _complete_return(
    university_id: int,
    return_id: int,
    row: Dict[str, Any],
    actor: Dict[str, Any],
) -> Optional[str]:
    """Complete exactly once, only after both student confirmations exist."""
    receipt = (
        f"RCPT-{row['return_code'].split('-')[-1]}-"
        f"{datetime.now().strftime('%y%m%d')}"
    )
    claim = pool.query_one(
        "SELECT lost_report_id FROM claims WHERE id=%s AND university_id=%s",
        (row["claim_id"], university_id),
    )

    with pool.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE returns
                SET status='completed', handover_confirmed_at=NOW(), receipt_number=%s
                WHERE id=%s AND university_id=%s
                  AND status <> 'completed'
                  AND owner_confirmed_at IS NOT NULL
                  AND finder_confirmed_at IS NOT NULL
                """,
                (receipt, return_id, university_id),
            )
            completed_now = cur.rowcount == 1
            if completed_now:
                cur.execute(
                    "UPDATE reports SET status='returned', closed_at=NOW() "
                    "WHERE id=%s AND university_id=%s",
                    (row["found_report_id"], university_id),
                )
                if claim and claim.get("lost_report_id"):
                    cur.execute(
                        "UPDATE reports SET status='returned', closed_at=NOW() "
                        "WHERE id=%s AND university_id=%s "
                        "AND status NOT IN ('returned','closed')",
                        (claim["lost_report_id"], university_id),
                    )

    if not completed_now:
        return None

    record_status_event(
        university_id,
        row["found_report_id"],
        "returned",
        note=f"Finder and owner both confirmed the campus handover — receipt {receipt}",
        actor_user_id=actor["id"],
        is_public=True,
    )
    if claim and claim.get("lost_report_id"):
        record_status_event(
            university_id,
            claim["lost_report_id"],
            "returned",
            note="Item recovered — both finder and owner confirmed the handover",
            actor_user_id=actor["id"],
            is_public=True,
        )

    create_qr(
        university_id=university_id,
        purpose="handover",
        report_id=row["found_report_id"],
        report_code=row["found_code"],
        claim_id=row["claim_id"],
        return_id=return_id,
    )

    for user_id, email in (
        (row.get("owner_user_id"), row.get("owner_email")),
        (row.get("finder_user_id"), row.get("finder_email")),
    ):
        if user_id:
            notify(
                university_id,
                user_id,
                "return_completed",
                f"Campus handover completed — receipt {receipt}",
                "Both students confirmed the physical exchange. Your digital receipt is available from the dashboard.",
                ref_type="return",
                ref_id=receipt,
                email=True,
                email_to=email,
                email_lines=[
                    f"Receipt: {receipt}",
                    f"Item: {row.get('item_title')}",
                    "Both the owner and finder confirmed the handover.",
                    "Keep this receipt for your records.",
                ],
            )

    pool.execute(
        "INSERT INTO notifications (university_id, user_id, channel, type, title, body, ref_type, ref_id) "
        "SELECT %s, u.id, 'in_app', 'return_completed', %s, %s, 'return', %s "
        "FROM users u JOIN roles r ON r.id=u.role_id "
        "WHERE u.university_id=%s AND r.code='university_admin'",
        (
            university_id,
            f"Return {row['return_code']} completed",
            f"Both students confirmed the handover. Receipt {receipt} issued.",
            receipt,
            university_id,
        ),
    )
    return receipt


def confirm(
    university_id: int,
    return_id: int,
    step: str,
    actor: Dict[str, Any],
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    row = get_return(return_id, university_id)
    if not row:
        raise ValueError("Return not found")
    if row["status"] == "completed":
        return {"status": "completed", "receipt_number": row.get("receipt_number")}

    if step == "owner_confirm":
        if actor["id"] != row["owner_user_id"]:
            raise ValueError("Only the verified owner can confirm this handover")
        column = "owner_confirmed_at"
        other_label = "finder"
    elif step == "finder_confirm":
        if actor["id"] != row.get("finder_user_id"):
            raise ValueError("Only the student who reported the found item can confirm this handover")
        column = "finder_confirmed_at"
        other_label = "owner"
    else:
        raise ValueError("Use owner_confirm or finder_confirm. Staff handover confirmation is not used.")

    if row["status"] not in {"scheduled", "ready", "owner_confirmed", "handed_over"}:
        raise ValueError("This return cannot be confirmed at its current stage")

    pool.execute(
        f"UPDATE returns SET {column}=COALESCE({column}, NOW()), notes=COALESCE(%s, notes) "
        "WHERE id=%s AND university_id=%s AND status <> 'completed'",
        (clean_text(notes, 500), return_id, university_id),
    )

    updated = get_return(return_id, university_id)
    if not updated:
        raise ValueError("Return not found after confirmation")

    if updated.get("owner_confirmed_at") and updated.get("finder_confirmed_at"):
        receipt = _complete_return(university_id, return_id, updated, actor)
        if receipt:
            return {"status": "completed", "receipt_number": receipt}
        latest = get_return(return_id, university_id)
        if latest and latest["status"] == "completed":
            return {"status": "completed", "receipt_number": latest.get("receipt_number")}

    counterpart_id = (
        updated.get("finder_user_id") if step == "owner_confirm"
        else updated.get("owner_user_id")
    )
    if counterpart_id:
        notify(
            university_id,
            counterpart_id,
            "return_participant_confirmed",
            f"One student confirmed handover — {updated['return_code']}",
            f"The {('owner' if step == 'owner_confirm' else 'finder')} has confirmed. "
            "Please meet at the scheduled campus location and confirm after the exchange.",
            ref_type="return",
            ref_id=updated["return_code"],
        )

    return {
        "status": "awaiting_other_confirmation",
        "owner_confirmed_at": iso(updated.get("owner_confirmed_at")),
        "finder_confirmed_at": iso(updated.get("finder_confirmed_at")),
        "message": f"Your confirmation is saved. Waiting for the {other_label} to confirm.",
    }


def receipt_data(return_id: int, university_id: int) -> Dict[str, Any]:
    row = get_return(return_id, university_id)
    if not row:
        raise ValueError("Return not found")
    if row["status"] != "completed" or not row.get("receipt_number"):
        raise ValueError("The receipt is available only after both students confirm the handover")

    university = pool.query_one(
        "SELECT name, code, contact_email, contact_phone, address_line FROM universities WHERE id=%s",
        (university_id,),
    )
    return {
        "receipt_number": row.get("receipt_number"),
        "return_code": row["return_code"],
        "status": row["status"],
        "issued_at": iso(row.get("handover_confirmed_at") or row.get("updated_at")),
        "item": {
            "report_code": row.get("found_code"),
            "title": row.get("item_title"),
        },
        "claim_code": row.get("claim_code"),
        "owner": {"name": row.get("owner_name")},
        "finder": {"name": row.get("finder_name")},
        "collection": {
            "scheduled_at": iso(row.get("scheduled_at")),
            "location": row.get("collection_location"),
            "zone": row.get("collection_zone"),
            "owner_confirmed_at": iso(row.get("owner_confirmed_at")),
            "finder_confirmed_at": iso(row.get("finder_confirmed_at")),
            "handover_confirmed_at": iso(row.get("handover_confirmed_at")),
        },
        "university": university,
        "verification_statement": (
            "This digital receipt confirms that the owner and the finder independently "
            "confirmed the physical exchange of the item described above."
        ),
    }