
"""
Email delivery using Resend API with SMTP fallback and manual logging.
"""
from __future__ import annotations

import base64
import hashlib
import html
import json
import logging
import os
import smtplib
import ssl
import urllib.error
import urllib.request

from email.message import EmailMessage
from email.utils import formataddr
from typing import Any, Dict, Optional, Tuple

from app.config import settings
from app.database.pool import pool

logger = logging.getLogger("lfc.mail")

FALLBACK_LOG = settings.UPLOAD_DIR.parent / "logs" / "mail-fallback.log"

RESEND_API_URL = "https://api.resend.com/emails"


# ---------------------------------------------------------------------------
# Secret handling
# ---------------------------------------------------------------------------
def _key() -> bytes:
    return hashlib.sha256(
        (settings.SECRET_KEY + "::smtp").encode("utf-8")
    ).digest()


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
        return bytes(
            b ^ key[i % len(key)] for i, b in enumerate(cipher)
        ).decode("utf-8")
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
            "SELECT smtp_host, smtp_port, smtp_username, smtp_password_enc, "
            "smtp_from_email, smtp_use_tls FROM university_settings "
            "WHERE university_id = %s",
            (university_id,),
        )
        if row and row.get("smtp_host"):
            config.update({
                "host": row["smtp_host"],
                "port": int(row["smtp_port"] or 587),
                "username": row.get("smtp_username"),
                "password": decrypt_secret(row.get("smtp_password_enc")),
                "from_email": row.get("smtp_from_email") or row.get("smtp_username"),
                "use_tls": bool(row.get("smtp_use_tls")),
                "source": "university",
            })

    return config


# ---------------------------------------------------------------------------
# Email logging and fallback
# ---------------------------------------------------------------------------
def _record(
    university_id: Optional[int],
    to_email: str,
    subject: str,
    body: str,
    status: str,
    error: str = "",
) -> None:
    try:
        pool.execute(
            "INSERT INTO email_log "
            "(university_id, to_email, subject, body, status, error) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (
                university_id,
                to_email,
                subject[:200],
                body,
                status,
                (error or "")[:255] or None,
            ),
        )
    except Exception:
        logger.exception("Could not write email log")


def _write_fallback(
    to_email: str,
    subject: str,
    body: str,
    reason: str,
) -> None:
    try:
        FALLBACK_LOG.parent.mkdir(parents=True, exist_ok=True)
        with FALLBACK_LOG.open("a", encoding="utf-8") as handle:
            handle.write(
                "=" * 76
                + f"\nTO: {to_email}\nSUBJECT: {subject}"
                + f"\nREASON: {reason}\n\n{body}\n\n"
            )
    except Exception:
        logger.exception("Could not write fallback email log")


# ---------------------------------------------------------------------------
# Resend API
# ---------------------------------------------------------------------------
def _send_with_resend(
    to_email: str,
    subject: str,
    body: str,
    from_name: Optional[str] = None,
) -> Tuple[str, str]:
    api_key = os.getenv("RESEND_API_KEY", "").strip()

    if not api_key:
        return "not_configured", "RESEND_API_KEY is missing"

    sender = os.getenv(
        "RESEND_FROM_EMAIL",
        "onboarding@resend.dev",
    ).strip()

    sender_name = from_name or "Lost & Found Campus"

    payload = {
        "from": formataddr((sender_name, sender)),
        "to": [to_email],
        "subject": subject,
        "text": body,
        "html": "<pre style='font-family:Arial,sans-serif;white-space:pre-wrap'>"
        + html.escape(body)
        + "</pre>",
    }

    request = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "LostFoundCampus/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
            email_id = result.get("id", "")
            logger.info("Resend accepted email. ID: %s", email_id)
            return "sent", ""

    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.warning(
            "Resend API rejected email. HTTP %s: %s",
            exc.code,
            error_body[:500],
        )
        return "failed", f"Resend HTTP {exc.code}: {error_body[:200]}"

    except Exception as exc:
        logger.warning("Resend delivery failed: %s", exc)
        return "failed", str(exc)


# ---------------------------------------------------------------------------
# SMTP fallback
# ---------------------------------------------------------------------------
def _send_with_smtp(
    to_email: str,
    subject: str,
    body: str,
    config: Dict[str, Any],
    from_name: Optional[str] = None,
) -> Tuple[str, str]:

    if not config["host"] or not config["from_email"]:
        return "not_configured", "SMTP is not configured"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(
        (from_name or "Lost & Found Campus", config["from_email"])
    )
    message["To"] = to_email
    message.set_content(body)

    try:
        context = ssl.create_default_context()

        if int(config["port"]) == 465:
            with smtplib.SMTP_SSL(
                config["host"],
                int(config["port"]),
                timeout=15,
                context=context,
            ) as server:
                if config["username"]:
                    server.login(config["username"], config["password"])
                server.send_message(message)
        else:
            with smtplib.SMTP(
                config["host"],
                int(config["port"]),
                timeout=15,
            ) as server:
                server.ehlo()

                if config["use_tls"]:
                    server.starttls(context=context)
                    server.ehlo()

                if config["username"]:
                    server.login(config["username"], config["password"])

                server.send_message(message)

        return "sent", ""

    except Exception as exc:
        logger.warning("SMTP delivery failed: %s", exc)
        return "failed", str(exc)


# ---------------------------------------------------------------------------
# Main sending function
# ---------------------------------------------------------------------------
def send_email(
    to_email: str,
    subject: str,
    body: str,
    university_id: Optional[int] = None,
    from_name: Optional[str] = None,
) -> Tuple[str, str]:
    """Returns (status, error): sent | failed | logged_only."""

    if not to_email:
        return "failed", "No recipient"

    # Prefer Resend API on hosted deployments.
    if os.getenv("RESEND_API_KEY", "").strip():
        status, error = _send_with_resend(
            to_email,
            subject,
            body,
            from_name,
        )
    else:
        config = smtp_config_for(university_id)
        status, error = _send_with_smtp(
            to_email,
            subject,
            body,
            config,
            from_name,
        )

    if status == "sent":
        _record(university_id, to_email, subject, body, "sent")
        return "sent", ""

    logger.warning("Email delivery failed: %s", error)

    if settings.EMAIL_FALLBACK_TO_LOG:
        _record(
            university_id,
            to_email,
            subject,
            body,
            "logged_only",
            error,
        )
        _write_fallback(to_email, subject, body, error)
        return "logged_only", error

    _record(
        university_id,
        to_email,
        subject,
        body,
        "failed",
        error,
    )
    return "failed", error


def render_template(
    title: str,
    lines: list[str],
    footer: Optional[str] = None,
) -> str:
    body = [title, "=" * len(title), ""] + lines + [""]
    body.append(
        footer
        or "This is an automated message from Lost & Found Campus. Please do not reply."
    )
    return "\n".join(body)
