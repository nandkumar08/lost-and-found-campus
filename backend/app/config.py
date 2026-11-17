"""
Application configuration.

Every secret is read from the environment (or a local .env file). Nothing
sensitive is hardcoded in source. See backend/.env.example for the full list.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (no external dependency required)."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Real environment always wins over the file.
        os.environ.setdefault(key, value)


_load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (BASE_DIR / path).resolve()


def _list(name: str, default: str) -> List[str]:
    return [part.strip() for part in os.getenv(name, default).split(",") if part.strip()]


class Settings:
    # --- Runtime -----------------------------------------------------------
    APP_NAME: str = os.getenv("APP_NAME", "Lost & Found Campus API")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = _bool("DEBUG", True)
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = _int("PORT", 8000)

    # --- Security ----------------------------------------------------------
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = _int("ACCESS_TOKEN_EXPIRE_MINUTES", 720)
    PASSWORD_RESET_EXPIRE_MINUTES: int = _int("PASSWORD_RESET_EXPIRE_MINUTES", 60)
    PBKDF2_ITERATIONS: int = _int("PBKDF2_ITERATIONS", 240_000)
    MAX_LOGIN_ATTEMPTS: int = _int("MAX_LOGIN_ATTEMPTS", 8)
    LOGIN_LOCK_MINUTES: int = _int("LOGIN_LOCK_MINUTES", 15)

    # --- MySQL -------------------------------------------------------------
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT: int = _int("DB_PORT", 3306)
    DB_USER: str = os.getenv("DB_USER", "lfc_app")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "lost_found_campus")
    DB_POOL_SIZE: int = _int("DB_POOL_SIZE", 8)

    # --- Files -------------------------------------------------------------
    # Relative paths are anchored to the backend directory so the app behaves
    # the same no matter which working directory uvicorn is started from.
    UPLOAD_DIR: Path = _resolve_path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
    MAX_UPLOAD_MB: int = _int("MAX_UPLOAD_MB", 5)
    MAX_IMAGES_PER_REPORT: int = _int("MAX_IMAGES_PER_REPORT", 5)
    ALLOWED_IMAGE_TYPES: List[str] = _list("ALLOWED_IMAGE_TYPES", "image/jpeg,image/png,image/webp")
    ALLOWED_DOC_TYPES: List[str] = _list(
        "ALLOWED_DOC_TYPES", "image/jpeg,image/png,image/webp,application/pdf"
    )

    # --- URLs / CORS -------------------------------------------------------
    PUBLIC_BASE_URL: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:5173")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")
    CORS_ORIGINS: List[str] = _list(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://localhost:3000",
    )
    # Dev preview hosts (e2b sandboxes and similar) are matched by suffix.
    CORS_ORIGIN_REGEX: str = os.getenv(
        "CORS_ORIGIN_REGEX", r"https?://([a-zA-Z0-9-]+\.)*(e2b\.app|arena\.ai)(:\d+)?$"
    )

    # --- Rate limiting -----------------------------------------------------
    RATE_LIMIT_ENABLED: bool = _bool("RATE_LIMIT_ENABLED", True)
    RATE_LIMIT_LOGIN: str = os.getenv("RATE_LIMIT_LOGIN", "10/minute")
    RATE_LIMIT_REPORT: str = os.getenv("RATE_LIMIT_REPORT", "20/hour")
    RATE_LIMIT_DEFAULT: str = os.getenv("RATE_LIMIT_DEFAULT", "240/minute")

    # --- SMTP --------------------------------------------------------------
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = _int("SMTP_PORT", 587)
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    SMTP_USE_TLS: bool = _bool("SMTP_USE_TLS", True)

    # --- Behaviour ---------------------------------------------------------
    DEFAULT_UNIVERSITY_CODE: str = os.getenv("DEFAULT_UNIVERSITY_CODE", "ADTU")
    # When SMTP is unavailable the mailer records messages in email_log instead
    # of failing the business transaction (documented manual fallback).
    EMAIL_FALLBACK_TO_LOG: bool = _bool("EMAIL_FALLBACK_TO_LOG", True)
    TRUST_PROXY_HEADERS: bool = _bool("TRUST_PROXY_HEADERS", True)

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV.lower() in {"development", "dev", "local", "test"}

    def validate(self) -> None:
        problems = []
        if not self.SECRET_KEY or len(self.SECRET_KEY) < 32:
            problems.append("SECRET_KEY must be set to at least 32 characters")
        if not self.DB_PASSWORD and not self.is_dev:
            problems.append("DB_PASSWORD must be set outside development")
        if problems:
            raise RuntimeError("Invalid configuration: " + "; ".join(problems))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.validate()
    return settings


settings = get_settings()

# Ensure upload directories exist.
for sub in ("reports", "private_documents", "claims", "qr", "branding", "receipts"):
    (settings.UPLOAD_DIR / sub).mkdir(parents=True, exist_ok=True)
