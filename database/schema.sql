-- ============================================================================
-- LOST & FOUND CAMPUS — MySQL / MariaDB Schema
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- No ORM. All application access is through parameterized SQL.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS lost_found_campus
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lost_found_campus;

-- ---------------------------------------------------------------------------
-- 1. UNIVERSITIES (tenant root)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS universities (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(180) NOT NULL,
  short_name      VARCHAR(60)  NOT NULL,
  code            VARCHAR(12)  NOT NULL,
  primary_color   VARCHAR(9)   NOT NULL DEFAULT '#142822',
  accent_color    VARCHAR(9)   NOT NULL DEFAULT '#D95D39',
  logo_path       VARCHAR(255) DEFAULT NULL,
  contact_email   VARCHAR(180) NOT NULL,
  contact_phone   VARCHAR(40)  DEFAULT NULL,
  address_line    VARCHAR(255) DEFAULT NULL,
  city            VARCHAR(120) DEFAULT NULL,
  region          VARCHAR(120) DEFAULT NULL,
  country         VARCHAR(120) DEFAULT 'India',
  status          ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  onboarding_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_universities_code (code),
  UNIQUE KEY uq_universities_name (name),
  KEY idx_universities_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. ROLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(60) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  level       TINYINT UNSIGNED NOT NULL DEFAULT 10,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, name, description, level) VALUES
  ('student',          'Student',              'Enrolled student of the university', 10),
  ('faculty',          'Faculty',              'Teaching faculty member', 20),
  ('university_staff', 'University Staff',     'Administrative or support staff', 20),
  ('security_personnel','Security Personnel',  'Campus safety and custody desk officer', 30),
  ('campus_member',    'Campus Member',        'Other verified member of the campus community', 10),
  ('university_admin', 'University Admin',     'Administers a single university tenant', 80),
  ('platform_admin',   'Platform Admin',       'Operates the multi-university platform', 100)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), level = VALUES(level);

-- ---------------------------------------------------------------------------
-- 3. USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id   INT UNSIGNED NOT NULL,
  role_id         TINYINT UNSIGNED NOT NULL,
  full_name       VARCHAR(140) NOT NULL,
  email           VARCHAR(180) NOT NULL,
  phone           VARCHAR(40)  DEFAULT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  campus_id_number VARCHAR(60) DEFAULT NULL,
  department      VARCHAR(140) DEFAULT NULL,
  academic_year   VARCHAR(40)  DEFAULT NULL,
  semester        VARCHAR(40)  DEFAULT NULL,
  designation     VARCHAR(120) DEFAULT NULL,
  avatar_path     VARCHAR(255) DEFAULT NULL,
  account_status  ENUM('active','pending','suspended','deactivated') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME DEFAULT NULL,
  last_login_at   DATETIME DEFAULT NULL,
  failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until    DATETIME DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_campus_id (university_id, campus_id_number),
  KEY idx_users_tenant (university_id, account_status),
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. UNIVERSITY SETTINGS (branding, SMTP, verification policy)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS university_settings (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id         INT UNSIGNED NOT NULL,
  verification_mode     ENUM('admin_manual','email_domain','hybrid') NOT NULL DEFAULT 'admin_manual',
  allowed_email_domains VARCHAR(400) DEFAULT NULL,
  require_id_upload     TINYINT(1) NOT NULL DEFAULT 1,
  matching_high_threshold DECIMAL(5,2) NOT NULL DEFAULT 75.00,
  matching_medium_threshold DECIMAL(5,2) NOT NULL DEFAULT 55.00,
  auto_close_days       SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  max_upload_mb         SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  support_email         VARCHAR(180) DEFAULT NULL,
  support_phone         VARCHAR(40)  DEFAULT NULL,
  smtp_host             VARCHAR(180) DEFAULT NULL,
  smtp_port             SMALLINT UNSIGNED DEFAULT 587,
  smtp_username         VARCHAR(180) DEFAULT NULL,
  smtp_password_enc     VARCHAR(400) DEFAULT NULL,
  smtp_from_email       VARCHAR(180) DEFAULT NULL,
  smtp_use_tls          TINYINT(1) NOT NULL DEFAULT 1,
  branding_json         JSON DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_university (university_id),
  CONSTRAINT fk_settings_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. USER VERIFICATIONS (campus identity applications)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_verifications (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id   INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  requested_role_code VARCHAR(40) NOT NULL,
  status          ENUM('pending','under_review','verified','rejected','suspended') NOT NULL DEFAULT 'pending',
  campus_id_number VARCHAR(60) DEFAULT NULL,
  department      VARCHAR(140) DEFAULT NULL,
  academic_year   VARCHAR(40) DEFAULT NULL,
  semester        VARCHAR(40) DEFAULT NULL,
  designation     VARCHAR(120) DEFAULT NULL,
  applicant_note  TEXT DEFAULT NULL,
  review_notes    TEXT DEFAULT NULL,
  rejection_reason VARCHAR(500) DEFAULT NULL,
  reviewed_by     INT UNSIGNED DEFAULT NULL,
  reviewed_at     DATETIME DEFAULT NULL,
  submitted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verif_tenant_status (university_id, status),
  KEY idx_verif_user (user_id),
  CONSTRAINT fk_verif_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_verif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_verif_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. IDENTITY DOCUMENTS (private — never publicly served)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_documents (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id   INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  verification_id INT UNSIGNED DEFAULT NULL,
  document_type   ENUM('student_id','employee_id','institutional_letter','other') NOT NULL DEFAULT 'student_id',
  file_path       VARCHAR(255) NOT NULL,
  original_name   VARCHAR(255) DEFAULT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_size       INT UNSIGNED NOT NULL,
  uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_docs_tenant (university_id),
  KEY idx_docs_user (user_id),
  KEY idx_docs_verification (verification_id),
  CONSTRAINT fk_docs_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_docs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_docs_verification FOREIGN KEY (verification_id) REFERENCES user_verifications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. CATEGORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(255) DEFAULT NULL,
  is_high_value TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_tenant_name (university_id, name),
  CONSTRAINT fk_categories_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. LOCATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  name          VARCHAR(140) NOT NULL,
  zone          VARCHAR(120) DEFAULT NULL,
  description   VARCHAR(255) DEFAULT NULL,
  is_storage    TINYINT(1) NOT NULL DEFAULT 0,
  locker_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locations_tenant_name (university_id, name),
  CONSTRAINT fk_locations_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. REPORTS (lost and found)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id     INT UNSIGNED NOT NULL,
  report_code       VARCHAR(24) NOT NULL,
  tracking_token    CHAR(64) NOT NULL,
  report_type       ENUM('lost','found') NOT NULL,
  category_id       INT UNSIGNED DEFAULT NULL,
  title             VARCHAR(180) NOT NULL,
  description       TEXT NOT NULL,
  colour            VARCHAR(80) DEFAULT NULL,
  brand             VARCHAR(80) DEFAULT NULL,
  confidential_marks TEXT DEFAULT NULL,
  incident_date     DATE NOT NULL,
  incident_time     TIME DEFAULT NULL,
  location_id       INT UNSIGNED DEFAULT NULL,
  location_text     VARCHAR(180) DEFAULT NULL,
  status            ENUM('searching','in_custody','matched','under_review','claim_pending','return_scheduled','returned','closed','archived') NOT NULL DEFAULT 'searching',
  reporter_user_id  INT UNSIGNED DEFAULT NULL,
  reporter_name     VARCHAR(140) DEFAULT NULL,
  reporter_email    VARCHAR(180) NOT NULL,
  reporter_phone    VARCHAR(40) DEFAULT NULL,
  custody_location  VARCHAR(180) DEFAULT NULL,
  custody_notes     VARCHAR(255) DEFAULT NULL,
  intake_officer_id INT UNSIGNED DEFAULT NULL,
  closed_at         DATETIME DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_code (report_code),
  UNIQUE KEY uq_reports_token (tracking_token),
  KEY idx_reports_tenant_type (university_id, report_type, status),
  KEY idx_reports_created (university_id, created_at),
  KEY idx_reports_reporter (reporter_user_id),
  KEY idx_reports_category (category_id),
  KEY idx_reports_location (location_id),
  CONSTRAINT fk_reports_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_location FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_officer FOREIGN KEY (intake_officer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. REPORT IMAGES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_images (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  report_id     INT UNSIGNED NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     INT UNSIGNED NOT NULL,
  width         SMALLINT UNSIGNED DEFAULT NULL,
  height        SMALLINT UNSIGNED DEFAULT NULL,
  is_primary    TINYINT(1) NOT NULL DEFAULT 0,
  visibility    ENUM('public','private') NOT NULL DEFAULT 'public',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_images_report (report_id, is_primary),
  KEY idx_images_tenant (university_id),
  CONSTRAINT fk_images_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_images_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. REPORT STATUS EVENTS (tracking timeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_status_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id  INT UNSIGNED NOT NULL,
  report_id      INT UNSIGNED NOT NULL,
  from_status    VARCHAR(40) DEFAULT NULL,
  to_status      VARCHAR(40) NOT NULL,
  note           VARCHAR(255) DEFAULT NULL,
  actor_user_id  INT UNSIGNED DEFAULT NULL,
  is_public      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_report (report_id, created_at),
  CONSTRAINT fk_events_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_events_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_events_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. MATCHES (smart matching engine output)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id   INT UNSIGNED NOT NULL,
  lost_report_id  INT UNSIGNED NOT NULL,
  found_report_id INT UNSIGNED NOT NULL,
  score           DECIMAL(5,2) NOT NULL,
  confidence      ENUM('high','medium','low') NOT NULL,
  score_breakdown JSON DEFAULT NULL,
  matched_fields  JSON DEFAULT NULL,
  status          ENUM('suggested','confirmed','rejected','closed') NOT NULL DEFAULT 'suggested',
  reviewed_by     INT UNSIGNED DEFAULT NULL,
  reviewed_at     DATETIME DEFAULT NULL,
  review_notes    VARCHAR(500) DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_matches_pair (lost_report_id, found_report_id),
  KEY idx_matches_tenant (university_id, status),
  KEY idx_matches_found (found_report_id),
  CONSTRAINT fk_matches_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_lost FOREIGN KEY (lost_report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_found FOREIGN KEY (found_report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. CLAIMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id     INT UNSIGNED NOT NULL,
  claim_code        VARCHAR(24) NOT NULL,
  found_report_id   INT UNSIGNED NOT NULL,
  claimant_user_id  INT UNSIGNED NOT NULL,
  lost_report_id    INT UNSIGNED DEFAULT NULL,
  match_id          INT UNSIGNED DEFAULT NULL,
  identifying_answer TEXT NOT NULL,
  status            ENUM('submitted','under_review','evidence_requested','approved','rejected','cancelled') NOT NULL DEFAULT 'submitted',
  rejection_reason  VARCHAR(500) DEFAULT NULL,
  admin_notes       TEXT DEFAULT NULL,
  reviewed_by       INT UNSIGNED DEFAULT NULL,
  reviewed_at       DATETIME DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_claims_code (claim_code),
  UNIQUE KEY uq_claim_report_claimant (found_report_id, claimant_user_id),
  KEY idx_claims_tenant_status (university_id, status),
  KEY idx_claims_claimant (claimant_user_id),
  CONSTRAINT fk_claims_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_report FOREIGN KEY (found_report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_claimant FOREIGN KEY (claimant_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_lost FOREIGN KEY (lost_report_id) REFERENCES reports (id) ON DELETE SET NULL,
  CONSTRAINT fk_claims_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE SET NULL,
  CONSTRAINT fk_claims_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. CLAIM EVIDENCE (private uploads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_evidence (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  claim_id      INT UNSIGNED NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     INT UNSIGNED NOT NULL,
  note          VARCHAR(255) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_evidence_claim (claim_id),
  CONSTRAINT fk_evidence_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 15. OWNERSHIP VERIFICATIONS (officer review record)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ownership_verifications (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id       INT UNSIGNED NOT NULL,
  claim_id            INT UNSIGNED NOT NULL,
  match_id            INT UNSIGNED DEFAULT NULL,
  officer_id          INT UNSIGNED DEFAULT NULL,
  verification_method ENUM('physical_inspection','documentary','serial_check','witness','combined') NOT NULL DEFAULT 'combined',
  findings            TEXT DEFAULT NULL,
  status              ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at        DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_ownership_claim (claim_id),
  KEY idx_ownership_tenant (university_id, status),
  CONSTRAINT fk_ownership_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE SET NULL,
  CONSTRAINT fk_ownership_officer FOREIGN KEY (officer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 16. RETURNS (collection scheduling + handover + receipt)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id         INT UNSIGNED NOT NULL,
  return_code           VARCHAR(24) NOT NULL,
  claim_id              INT UNSIGNED NOT NULL,
  found_report_id       INT UNSIGNED NOT NULL,
  owner_user_id         INT UNSIGNED NOT NULL,
  scheduled_at          DATETIME NOT NULL,
  collection_location_id INT UNSIGNED DEFAULT NULL,
  collection_instructions VARCHAR(400) DEFAULT NULL,
  security_officer_id   INT UNSIGNED DEFAULT NULL,
  security_confirmed_at DATETIME DEFAULT NULL,
  owner_confirmed_at    DATETIME DEFAULT NULL,
  handover_confirmed_at DATETIME DEFAULT NULL,
  status                ENUM('scheduled','ready','owner_confirmed','handed_over','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  receipt_number        VARCHAR(30) DEFAULT NULL,
  receipt_path          VARCHAR(255) DEFAULT NULL,
  notes                 VARCHAR(500) DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_returns_code (return_code),
  KEY idx_returns_tenant_status (university_id, status),
  KEY idx_returns_owner (owner_user_id),
  CONSTRAINT fk_returns_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_report FOREIGN KEY (found_report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_location FOREIGN KEY (collection_location_id) REFERENCES locations (id) ON DELETE SET NULL,
  CONSTRAINT fk_returns_officer FOREIGN KEY (security_officer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 17. QR CODES (server generated; token hash only, never personal data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_codes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  report_id     INT UNSIGNED DEFAULT NULL,
  claim_id      INT UNSIGNED DEFAULT NULL,
  return_id     INT UNSIGNED DEFAULT NULL,
  purpose       ENUM('tracking','custody','handover') NOT NULL DEFAULT 'tracking',
  code          VARCHAR(64) NOT NULL,
  token_hash    CHAR(64) NOT NULL,
  image_path    VARCHAR(255) DEFAULT NULL,
  payload_url   VARCHAR(255) NOT NULL,
  scan_count    INT UNSIGNED NOT NULL DEFAULT 0,
  last_scanned_at DATETIME DEFAULT NULL,
  expires_at    DATETIME DEFAULT NULL,
  revoked_at    DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qr_code (code),
  KEY idx_qr_tenant (university_id),
  KEY idx_qr_report (report_id),
  CONSTRAINT fk_qr_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_qr_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_qr_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE SET NULL,
  CONSTRAINT fk_qr_return FOREIGN KEY (return_id) REFERENCES returns (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 18. NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED DEFAULT NULL,
  email_to      VARCHAR(180) DEFAULT NULL,
  channel       ENUM('in_app','email','both') NOT NULL DEFAULT 'in_app',
  type          VARCHAR(60) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body          TEXT DEFAULT NULL,
  ref_type      VARCHAR(40) DEFAULT NULL,
  ref_id        VARCHAR(40) DEFAULT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  read_at       DATETIME DEFAULT NULL,
  email_status  ENUM('not_sent','queued','sent','failed','skipped') NOT NULL DEFAULT 'not_sent',
  email_error   VARCHAR(255) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read, created_at),
  KEY idx_notif_tenant (university_id, created_at),
  CONSTRAINT fk_notif_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 19. ADMIN LOGS (audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED DEFAULT NULL,
  actor_user_id INT UNSIGNED DEFAULT NULL,
  actor_name    VARCHAR(140) DEFAULT NULL,
  actor_role    VARCHAR(60) DEFAULT NULL,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(40) DEFAULT NULL,
  entity_id     VARCHAR(40) DEFAULT NULL,
  detail        VARCHAR(500) DEFAULT NULL,
  ip_address    VARCHAR(64) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_tenant (university_id, created_at),
  KEY idx_logs_actor (actor_user_id),
  CONSTRAINT fk_logs_university FOREIGN KEY (university_id) REFERENCES universities (id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 20. PASSWORD RESETS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME DEFAULT NULL,
  requested_ip VARCHAR(64) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reset_token (token_hash),
  KEY idx_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 21. EMAIL LOG (development + audit fallback when SMTP is not configured)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id INT UNSIGNED DEFAULT NULL,
  to_email      VARCHAR(180) NOT NULL,
  subject       VARCHAR(200) NOT NULL,
  body          TEXT DEFAULT NULL,
  status        ENUM('sent','failed','logged_only') NOT NULL DEFAULT 'logged_only',
  error         VARCHAR(255) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_tenant (university_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 22. PLATFORM SETTINGS (single row, platform-wide configuration)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  id                TINYINT UNSIGNED NOT NULL DEFAULT 1,
  platform_name     VARCHAR(120) NOT NULL DEFAULT 'Lost & Found Campus',
  support_email     VARCHAR(180) NOT NULL DEFAULT 'support@lostfoundcampus.example',
  allow_public_reporting TINYINT(1) NOT NULL DEFAULT 1,
  default_university_id INT UNSIGNED DEFAULT NULL,
  announcement      VARCHAR(500) DEFAULT NULL,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_platform_university FOREIGN KEY (default_university_id) REFERENCES universities (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (id, platform_name, support_email)
VALUES (1, 'Lost & Found Campus', 'support@lostfoundcampus.example')
ON DUPLICATE KEY UPDATE platform_name = VALUES(platform_name);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Useful reporting indexes are declared inline above. Soft deletion is handled
-- with deleted_at on universities, users, categories, locations, reports,
-- report_images, identity_documents and claim_evidence.
-- ============================================================================
