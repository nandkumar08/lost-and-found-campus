"""
Email delivery with a documented manual fallback.

Resolution order for SMTP credentials:
  1. university_settings (per tenant, password stored encrypted)
  2. environment variables

If neither is configured, or delivery fails while EMAIL_FALLBACK_TO_LOG is on,
the message is written to the `email_log` table and to
backend/uploads/../logs/mail-fallback.log so the workflow can continue and an
administrator can deliver it manually. The UI always shows the in-app
notification regardless.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any, Dict, Optional, Tuple

from app.config import settings
from app.database.pool import pool

logger = logging.getLogger("lfc.mail")

FALLBACK_LOG = settings.UPLOAD_DIR.parent / "logs" / "mail-fallback.log"


# ---------------------------------------------------------------------------
# Secret handling for per-university SMTP passwords
# ---------------------------------------------------------------------------
def _key() -> bytes:
    return hashlib.sha256((settings.SECRET_KEY + "::smtp").encode("utf-8")).digest()


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    key = _key()
    raw = value.encode("utf-8")
    cipher = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return base64.urlsafe_b64encode(cipher).decode()


def decrypt_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        key = _key()
        cipher = base64.urlsafe_b64decode(value.encode())
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(cipher)).decode("utf-8")
    except Exception:
        return ""


def smtp_config_for(university_id: Optional[int]) -> Dict[str, Any]:
    config = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "username": settings.SMTP_USERNAME,
        "password": settings.SMTP_PASSWORD,
        "from_email": settings.SMTP_FROM or settings.SMTP_USERNAME,
        "use_tls": settings.SMTP_USE_TLS,
        "source": "environment",
    }
    if university_id:
        row = pool.query_one(
            "SELECT smtp_host, smtp_port, smtp_username, smtp_password_enc, smtp_from_email, "
            "smtp_use_tls FROM university_settings WHERE university_id = %s",
            (university_id,),
        )
        if row and row.get("smtp_host"):
            config.update(
                {
                    "host": row["smtp_host"],
                    "port": int(row["smtp_port"] or 587),
                    "username": row.get("smtp_username"),
                    "password": decrypt_secret(row.get("smtp_password_enc")),
                    "from_email": row.get("smtp_from_email") or row.get("smtp_username"),
                    "use_tls": bool(row.get("smtp_use_tls")),
                    "source": "university",
                }
            )
    return config


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def _record(
    university_id: Optional[int], to_email: str, subject: str, body: str, status: str, error: str = ""
) -> None:
    try:
        pool.execute(
            "INSERT INTO email_log (university_id, to_email, subject, body, status, error) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (university_id, to_email, subject[:200], body, status, (error or "")[:255] or None),
        )
    except Exception:  # pragma: no cover
        pass


def _write_fallback(to_email: str, subject: str, body: str, reason: str) -> None:
    try:
        FALLBACK_LOG.parent.mkdir(parents=True, exist_ok=True)
        with FALLBACK_LOG.open("a", encoding="utf-8") as handle:
            handle.write(
                "=" * 76
                + f"\nTO: {to_email}\nSUBJECT: {subject}\nREASON: {reason}\n\n{body}\n\n"
            )
    except Exception:  # pragma: no cover
        pass


def send_email(
    to_email: str,
    subject: str,
    body: str,
    university_id: Optional[int] = None,
    from_name: Optional[str] = None,
) -> Tuple[str, str]:
    """Returns (status, error). status ∈ sent | failed | logged_only."""
    if not to_email:
        return "failed", "No recipient"

    config = smtp_config_for(university_id)
    if not config["host"] or not config["from_email"]:
        reason = "SMTP not configured — message stored in email_log (manual fallback)"
        _record(university_id, to_email, subject, body, "logged_only", reason)
        _write_fallback(to_email, subject, body, reason)
        return "logged_only", reason

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((from_name or "Lost & Found Campus", config["from_email"]))
    message["To"] = to_email
    message.set_content(body)

    try:
        context = ssl.create_default_context()
        if int(config["port"]) == 465:
            with smtplib.SMTP_SSL(config["host"], int(config["port"]), timeout=15, context=context) as server:
                if config["username"]:
                    server.login(config["username"], config["password"])
                server.send_message(message)
        else:
            with smtplib.SMTP(config["host"], int(config["port"]), timeout=15) as server:
                server.ehlo()
                if config["use_tls"]:
                    server.starttls(context=context)
                    server.ehlo()
                if config["username"]:
                    server.login(config["username"], config["password"])
                server.send_message(message)
        _record(university_id, to_email, subject, body, "sent")
        return "sent", ""
    except Exception as exc:  # pragma: no cover - depends on external SMTP
        logger.warning("SMTP delivery failed: %s", exc)
        if settings.EMAIL_FALLBACK_TO_LOG:
            _record(university_id, to_email, subject, body, "logged_only", str(exc))
            _write_fallback(to_email, subject, body, str(exc))
            return "logged_only", str(exc)
        _record(university_id, to_email, subject, body, "failed", str(exc))
        return "failed", str(exc)


def render_template(title: str, lines: list[str], footer: Optional[str] = None) -> str:
    body = [title, "=" * len(title), ""] + lines + [""]
    body.append(footer or "This is an automated message from Lost & Found Campus. Please do not reply.")
    return "\n".join(body)
