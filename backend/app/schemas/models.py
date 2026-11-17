"""Pydantic request models (response shapes are built in the service layer)."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    university_id: Optional[int] = None
    university_code: Optional[str] = None
    role: str
    full_name: str = Field(min_length=3, max_length=140)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    campus_id_number: str = Field(min_length=2, max_length=60)
    department: Optional[str] = Field(default=None, max_length=140)
    academic_year: Optional[str] = Field(default=None, max_length=40)
    semester: Optional[str] = Field(default=None, max_length=40)
    designation: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("role")
    @classmethod
    def role_allowed(cls, value: str) -> str:
        allowed = {"student", "faculty", "university_staff", "security_personnel", "campus_member"}
        if value not in allowed:
            raise ValueError("Choose a valid campus role")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    university_code: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    university_code: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=140)
    phone: Optional[str] = Field(default=None, max_length=40)
    department: Optional[str] = Field(default=None, max_length=140)
    academic_year: Optional[str] = Field(default=None, max_length=40)
    semester: Optional[str] = Field(default=None, max_length=40)
    designation: Optional[str] = Field(default=None, max_length=120)


class ReportCreatePayload(BaseModel):
    """Validated non-file portion of a report submission."""

    report_type: str
    title: str = Field(min_length=3, max_length=180)
    category_id: Optional[int] = None
    description: str = Field(min_length=10, max_length=4000)
    colour: Optional[str] = Field(default=None, max_length=80)
    brand: Optional[str] = Field(default=None, max_length=80)
    confidential_marks: Optional[str] = Field(default=None, max_length=2000)
    incident_date: str
    incident_time: Optional[str] = None
    location_id: Optional[int] = None
    location_text: Optional[str] = Field(default=None, max_length=180)
    reporter_name: Optional[str] = Field(default=None, max_length=140)
    reporter_email: EmailStr
    reporter_phone: Optional[str] = Field(default=None, max_length=40)
    custody_location: Optional[str] = Field(default=None, max_length=180)
    custody_notes: Optional[str] = Field(default=None, max_length=255)


class ClaimCreatePayload(BaseModel):
    found_report_id: int
    identifying_answer: str = Field(min_length=15, max_length=2000)
    lost_report_id: Optional[int] = None
    match_id: Optional[int] = None
    evidence_note: Optional[str] = Field(default=None, max_length=255)


class ClaimReviewPayload(BaseModel):
    action: str
    reason: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=4000)
    verification_method: str = "combined"
    findings: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("action")
    @classmethod
    def action_allowed(cls, value: str) -> str:
        allowed = {"approve", "reject", "request_evidence", "start_review"}
        if value not in allowed:
            raise ValueError("Unsupported action")
        return value


class ReturnSchedulePayload(BaseModel):
    claim_id: int
    scheduled_at: str
    location_id: Optional[int] = None
    instructions: Optional[str] = Field(default=None, max_length=400)


class ReturnConfirmPayload(BaseModel):
    step: str
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("step")
    @classmethod
    def step_allowed(cls, value: str) -> str:
        allowed = {"security_ready", "owner_confirm", "handover"}
        if value not in allowed:
            raise ValueError("Unsupported confirmation step")
        return value


class VerificationReviewPayload(BaseModel):
    action: str
    reason: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("action")
    @classmethod
    def action_allowed(cls, value: str) -> str:
        allowed = {"verify", "reject", "start_review", "suspend", "reopen"}
        if value not in allowed:
            raise ValueError("Unsupported verification action")
        return value


class CategoryPayload(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    is_high_value: bool = False
    is_active: bool = True
    sort_order: int = 100


class LocationPayload(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    zone: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=255)
    is_storage: bool = False
    locker_count: int = 0
    is_active: bool = True


class MatchReviewPayload(BaseModel):
    action: str
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("action")
    @classmethod
    def action_allowed(cls, value: str) -> str:
        if value not in {"confirm", "reject"}:
            raise ValueError("action must be confirm or reject")
        return value


class ReportStatusPayload(BaseModel):
    status: str
    note: Optional[str] = Field(default=None, max_length=255)


class UserStatusPayload(BaseModel):
    account_status: str
    reason: Optional[str] = Field(default=None, max_length=255)


class UserRolePayload(BaseModel):
    role: str


class UniversitySettingsPayload(BaseModel):
    verification_mode: Optional[str] = None
    allowed_email_domains: Optional[str] = Field(default=None, max_length=400)
    require_id_upload: Optional[bool] = None
    matching_high_threshold: Optional[float] = Field(default=None, ge=0, le=100)
    matching_medium_threshold: Optional[float] = Field(default=None, ge=0, le=100)
    auto_close_days: Optional[int] = Field(default=None, ge=1, le=3650)
    max_upload_mb: Optional[int] = Field(default=None, ge=1, le=50)
    support_email: Optional[str] = Field(default=None, max_length=180)
    support_phone: Optional[str] = Field(default=None, max_length=40)
    smtp_host: Optional[str] = Field(default=None, max_length=180)
    smtp_port: Optional[int] = Field(default=None, ge=1, le=65535)
    smtp_username: Optional[str] = Field(default=None, max_length=180)
    smtp_password: Optional[str] = Field(default=None, max_length=180)
    smtp_from_email: Optional[str] = Field(default=None, max_length=180)
    smtp_use_tls: Optional[bool] = None


class UniversityProfilePayload(BaseModel):
    name: Optional[str] = Field(default=None, max_length=180)
    short_name: Optional[str] = Field(default=None, max_length=60)
    contact_email: Optional[str] = Field(default=None, max_length=180)
    contact_phone: Optional[str] = Field(default=None, max_length=40)
    address_line: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=120)
    region: Optional[str] = Field(default=None, max_length=120)
    primary_color: Optional[str] = Field(default=None, max_length=9)
    accent_color: Optional[str] = Field(default=None, max_length=9)


class UniversityCreatePayload(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    short_name: str = Field(min_length=2, max_length=60)
    code: str = Field(min_length=2, max_length=12)
    contact_email: EmailStr
    contact_phone: Optional[str] = Field(default=None, max_length=40)
    city: Optional[str] = Field(default=None, max_length=120)
    region: Optional[str] = Field(default=None, max_length=120)
    address_line: Optional[str] = Field(default=None, max_length=255)
    primary_color: str = "#142822"
    accent_color: str = "#D95D39"
    admin_full_name: str = Field(min_length=3, max_length=140)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=128)
    seed_defaults: bool = True


class UniversityStatusPayload(BaseModel):
    status: str
    reason: Optional[str] = Field(default=None, max_length=255)


class PlatformSettingsPayload(BaseModel):
    platform_name: Optional[str] = Field(default=None, max_length=120)
    support_email: Optional[str] = Field(default=None, max_length=180)
    allow_public_reporting: Optional[bool] = None
    announcement: Optional[str] = Field(default=None, max_length=500)


class NotificationBulkReadPayload(BaseModel):
    ids: Optional[List[int]] = None
