"""
Security primitives: PBKDF2-HMAC password hashing, JWT issue/verify,
cryptographic random tokens for tracking / QR / resets, and a small
in-process rate limiter.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Dict, Optional, Tuple

from jose import JWTError, jwt

from app.config import settings

PBKDF2_ALGO = "pbkdf2_sha256"
PBKDF2_ROUNDS = settings.PBKDF2_ITERATIONS


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256 with per-password random salt)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS
    )
    return f"{PBKDF2_ALGO}${PBKDF2_ROUNDS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt, expected = stored.split("$", 3)
        if algo != PBKDF2_ALGO:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(rounds)
        )
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def password_strength_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if not any(c.isalpha() for c in password):
        problems.append("at least one letter")
    if not any(c.isdigit() for c in password):
        problems.append("at least one number")
    return problems


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
def new_tracking_token() -> str:
    """64 hex chars — used in the secure public tracking URL."""
    return secrets.token_hex(32)


def new_qr_token() -> str:
    """Short, URL-safe, unguessable token embedded in QR payloads."""
    return base64.urlsafe_b64encode(secrets.token_bytes(24)).decode().rstrip("=")


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
def create_access_token(subject: str | int, claims: Dict[str, Any]) -> Tuple[str, int]:
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "iss": "lost-and-found-campus",
        **claims,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer="lost-and-found-campus",
        )
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


# ---------------------------------------------------------------------------
# Rate limiting (sliding window, per key)
# ---------------------------------------------------------------------------
class RateLimiter:
    def __init__(self) -> None:
        self._hits: Dict[str, list[float]] = {}
        self._lock = Lock()

    @staticmethod
    def _parse(rule: str) -> Tuple[int, int]:
        amount, _, window = rule.partition("/")
        count = int(amount or 60)
        seconds = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}.get(
            window.strip().lower().rstrip("s") + "s", 60
        )
        return count, seconds

    def check(self, key: str, rule: str) -> Tuple[bool, int]:
        if not settings.RATE_LIMIT_ENABLED:
            return True, 0
        limit, window = self._parse(rule)
        now = time.monotonic()
        with self._lock:
            bucket = [t for t in self._hits.get(key, []) if now - t < window]
            if len(bucket) >= limit:
                retry = int(window - (now - bucket[0])) + 1
                self._hits[key] = bucket
                return False, retry
            bucket.append(now)
            self._hits[key] = bucket
        return True, 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


rate_limiter = RateLimiter()


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------
def mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        return "***"
    keep = local[:2]
    return f"{keep}{'*' * max(3, len(local) - 2)}@{domain}"


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return phone
    digits = phone.strip()
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{'*' * (len(digits) - 4)}{digits[-4:]}"
