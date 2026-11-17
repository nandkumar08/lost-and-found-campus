"""
DEVELOPMENT / DEMONSTRATION SEED DATA
=====================================
Creates a clearly labelled demo dataset (universities, staff, students, reports,
claims, returns). Never run this against a production database.

Usage:
    cd backend
    python -m scripts.seed_demo            # create if missing (idempotent)
    python -m scripts.seed_demo --reset    # wipe demo tenant data first
"""
from __future__ import annotations

import argparse
import io
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw  # noqa: E402

from app.database.pool import pool  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services import claim_service, report_service, return_service  # noqa: E402
from app.services.notification_service import notify  # noqa: E402

DEMO_PASSWORD = "Campus#2026"

CATEGORIES = [
    ("Electronics", "Laptops, phones, earbuds and chargers", 1, 10),
    ("Bags & Luggage", "Backpacks, totes and messenger bags", 0, 20),
    ("Accessories & Eyewear", "Watches, glasses, belts and jewellery", 0, 30),
    ("Keys & Campus ID Cards", "Dorm keys, fobs and ID cards", 1, 40),
    ("Books & Lab Equipment", "Textbooks, notebooks and instruments", 0, 50),
    ("Clothing & Sports Gear", "Jackets, shoes and sports equipment", 0, 60),
    ("Documents & Folders", "Files, certificates and folders", 0, 70),
]

LOCATIONS = [
    ("Central Library", "Academic Core", "Three floors, quiet zones and study pods", 0, 0),
    ("Central Security Vault", "Main Entrance Plaza", "Primary custody vault with numbered lockers", 1, 40),
    ("North Gate Custody Desk", "Main Entrance Plaza", "Secondary intake desk", 1, 20),
    ("Science & Engineering Block", "East Campus", "Lecture halls and laboratories", 0, 0),
    ("Student Commons", "Student Commons", "Cafeteria, courtyard and lounges", 0, 0),
    ("Sports Complex", "West Campus", "Track, courts and gymnasium", 0, 0),
    ("Architecture Courtyard", "East Campus", "Design studios and courtyard", 0, 0),
]


def make_image(label: str, colour: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (900, 640), colour)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((60, 60, 840, 580), radius=40, outline=(255, 255, 255), width=8)
    draw.text((110, 300), label, fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def reset_demo() -> None:
    print("• Resetting demo data…")
    pool.execute("SET FOREIGN_KEY_CHECKS=0")
    for table in (
        "email_log",
        "admin_logs",
        "notifications",
        "qr_codes",
        "returns",
        "ownership_verifications",
        "claim_evidence",
        "claims",
        "matches",
        "report_status_events",
        "report_images",
        "reports",
        "identity_documents",
        "user_verifications",
        "password_resets",
        "users",
        "categories",
        "locations",
        "university_settings",
        "universities",
    ):
        pool.execute(f"DELETE FROM {table}")
    pool.execute("SET FOREIGN_KEY_CHECKS=1")


def ensure_university(name: str, short: str, code: str, email: str, city: str, status: str = "active",
                      primary="#142822", accent="#D95D39") -> int:
    row = pool.query_one("SELECT id FROM universities WHERE code=%s", (code,))
    if row:
        return row["id"]
    university_id = pool.execute(
        "INSERT INTO universities (name, short_name, code, contact_email, contact_phone, city, region, "
        "primary_color, accent_color, status, onboarding_step) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,4)",
        (name, short, code, email, "+91 20 4000 1200", city, "Maharashtra", primary, accent, status),
    )
    pool.execute(
        "INSERT INTO university_settings (university_id, support_email, verification_mode, "
        "allowed_email_domains, matching_high_threshold, matching_medium_threshold) "
        "VALUES (%s,%s,'admin_manual',%s,75,55)",
        (university_id, email, email.split("@")[-1]),
    )
    print(f"  ✓ university {code}")
    return university_id


def seed_catalog(university_id: int) -> tuple[dict, dict]:
    categories, locations = {}, {}
    for name, description, high, order in CATEGORIES:
        pool.execute(
            "INSERT IGNORE INTO categories (university_id, name, description, is_high_value, sort_order) "
            "VALUES (%s,%s,%s,%s,%s)",
            (university_id, name, description, high, order),
        )
        categories[name] = pool.query_one(
            "SELECT id FROM categories WHERE university_id=%s AND name=%s", (university_id, name)
        )["id"]
    for name, zone, description, storage, lockers in LOCATIONS:
        pool.execute(
            "INSERT IGNORE INTO locations (university_id, name, zone, description, is_storage, locker_count) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (university_id, name, zone, description, storage, lockers),
        )
        locations[name] = pool.query_one(
            "SELECT id FROM locations WHERE university_id=%s AND name=%s", (university_id, name)
        )["id"]
    return categories, locations


def ensure_user(university_id: int, role_code: str, full_name: str, email: str, campus_id: str,
                department: str, extra: dict | None = None, verification: str = "verified",
                password: str = DEMO_PASSWORD, account_status: str = "active") -> int:
    extra = extra or {}
    existing = pool.query_one("SELECT id FROM users WHERE email=%s", (email,))
    if existing:
        return existing["id"]
    role = pool.query_one("SELECT id FROM roles WHERE code=%s", (role_code,))
    user_id = pool.execute(
        """
        INSERT INTO users (university_id, role_id, full_name, email, phone, password_hash,
                           campus_id_number, department, academic_year, semester, designation,
                           account_status, email_verified_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
        """,
        (
            university_id,
            role["id"],
            full_name,
            email,
            extra.get("phone", "+91 98200 11223"),
            hash_password(password),
            campus_id,
            department,
            extra.get("academic_year"),
            extra.get("semester"),
            extra.get("designation"),
            account_status,
        ),
    )
    status = verification if verification != "not_submitted" else "pending"
    verif_id = pool.execute(
        """
        INSERT INTO user_verifications
            (university_id, user_id, requested_role_code, status, campus_id_number, department,
             academic_year, semester, designation, submitted_at, reviewed_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
        """,
        (
            university_id,
            user_id,
            role_code,
            status,
            campus_id,
            department,
            extra.get("academic_year"),
            extra.get("semester"),
            extra.get("designation"),
            None if status in {"pending", "under_review"} else datetime.now(),
        ),
    )
    if verification not in {"not_submitted", "pending"}:
        # Attach a demonstration ID document image so the review screen has data.
        meta_bytes = make_image(f"DEMO ID • {campus_id}", (32, 58, 48))
        from app.image_processing.processor import process_document

        meta = process_document(meta_bytes, f"{campus_id}-id.jpg", "private_documents")
        pool.execute(
            "INSERT INTO identity_documents (university_id, user_id, verification_id, document_type, "
            "file_path, original_name, mime_type, file_size) VALUES (%s,%s,%s,'student_id',%s,%s,%s,%s)",
            (
                university_id,
                user_id,
                verif_id,
                meta["file_path"],
                meta["original_name"],
                meta["mime_type"],
                meta["file_size"],
            ),
        )
    print(f"  ✓ user {email} ({role_code}/{status})")
    return user_id


def main(reset: bool) -> None:
    if reset:
        reset_demo()
    print("• Seeding Lost & Found Campus demo data…")

    alderton = ensure_university(
        "Alderton University", "Alderton", "ALDU", "custody@alderton.edu", "Pune"
    )
    vindhya = ensure_university(
        "Vindhya Institute of Technology", "Vindhya Tech", "VNTU",
        "safety@vindhyatech.edu", "Nagpur", "active", "#183028", "#C85A32"
    )
    cedar = ensure_university(
        "Cedar Ridge State College", "Cedar Ridge", "CRSC",
        "helpdesk@cedarridge.edu", "Nashik", "suspended", "#1F3A32", "#B45309"
    )

    platform_admin = ensure_user(
        0 if False else alderton,
        "platform_admin",
        "Platform Operations",
        "platform@lostfoundcampus.example",
        "PLAT-0001",
        "Platform Operations",
        verification="verified",
    )
    pool.execute("UPDATE users SET university_id=%s WHERE id=%s", (alderton, platform_admin))
    pool.execute(
        "INSERT INTO platform_settings (id, default_university_id) VALUES (1,%s) "
        "ON DUPLICATE KEY UPDATE default_university_id=%s",
        (alderton, alderton),
    )

    admin = ensure_user(
        alderton, "university_admin", "Dr. S. Menon", "admin@alderton.edu",
        "ADM-0001", "Student Affairs", {"designation": "Registrar"}
    )
    security = ensure_user(
        alderton, "security_personnel", "Officer Rakesh Deshmukh", "security@alderton.edu",
        "SEC-0019", "Campus Safety & Custody", {"designation": "Shift Supervisor"}
    )
    security2 = ensure_user(
        alderton, "security_personnel", "Officer Meera Joshi", "meera.joshi@alderton.edu",
        "SEC-0024", "Campus Safety & Custody", {"designation": "Intake Officer"}
    )
    student = ensure_user(
        alderton, "student", "Aarav Sharma", "student@alderton.edu",
        "STU-1108", "Computer Science", {"academic_year": "3rd Year", "semester": "Semester 5"}
    )
    student2 = ensure_user(
        alderton, "student", "Diya Nair", "diya.nair@alderton.edu",
        "STU-0492", "Biotechnology", {"academic_year": "2nd Year", "semester": "Semester 3"}
    )
    faculty = ensure_user(
        alderton, "faculty", "Dr. Vikram Rao", "faculty@alderton.edu",
        "FAC-0084", "Architecture & Design", {"designation": "Associate Professor"}
    )
    pending_student = ensure_user(
        alderton, "student", "Ananya Deshpande", "ananya.d@alderton.edu",
        "STU-1419", "Biotechnology", {"academic_year": "2nd Year", "semester": "Semester 3"},
        verification="pending", account_status="pending"
    )
    review_staff = ensure_user(
        alderton, "university_staff", "Priya Sen", "priya.sen@alderton.edu",
        "STF-0201", "Central Library Admin", {"designation": "Senior Archivist"},
        verification="under_review", account_status="pending"
    )
    ensure_user(
        vindhya, "university_admin", "Dr. Kavita Iyer", "admin@vindhyatech.edu",
        "ADM-1001", "Administration", {"designation": "Dean of Students"}
    )
    ensure_user(
        vindhya, "student", "Rohan Patil", "rohan.patil@vindhyatech.edu",
        "VNTU-2201", "Mechanical Engineering", {"academic_year": "4th Year"}
    )

    categories, locations = seed_catalog(alderton)
    seed_catalog(vindhya)

    admin_row = {k: v for k, v in pool.query_one(
        "SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s",
        (admin,),
    ).items()}
    officer_row = pool.query_one(
        "SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s",
        (security,),
    )
    student_row = pool.query_one(
        "SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s",
        (student,),
    )
    faculty_row = pool.query_one(
        "SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s",
        (faculty,),
    )

    if pool.scalar("SELECT COUNT(*) AS c FROM reports WHERE university_id=%s", (alderton,), 0):
        print("• Reports already present — skipping report seeds")
        return

    today = date.today()

    def create(payload: dict, images: list[bytes], user_row):
        return report_service.create_report(
            alderton, payload, [(img, f"{payload['title'][:12]}.jpg") for img in images], user_row
        )

    print("• Creating demo reports (matching + QR generation runs live)…")
    lost_laptop = create(
        {
            "report_type": "lost",
            "title": 'MacBook Pro 14" Space Black',
            "category_id": categories["Electronics"],
            "description": '14-inch laptop inside a charcoal wool-felt sleeve with a braided USB-C cable '
                           'and a small brass compass sticker beside the trackpad.',
            "colour": "Space Black",
            "brand": "Apple",
            "confidential_marks": 'Brass compass decal left of the trackpad; serial suffix 9K4M; '
                                  'lock screen wallpaper is a mountain ridge at sunrise.',
            "incident_date": (today - timedelta(days=3)).isoformat(),
            "incident_time": "16:30",
            "location_id": locations["Central Library"],
            "location_text": "Central Library — 3rd Floor Quiet Zone",
            "reporter_email": "student@alderton.edu",
            "reporter_phone": "+91 98201 44102",
        },
        [make_image("MacBook Pro 14", (46, 48, 52))],
        student_row,
    )

    found_laptop = create(
        {
            "report_type": "found",
            "title": 'Apple 14" Laptop in Charcoal Sleeve',
            "category_id": categories["Electronics"],
            "description": 'Found powered down near a floor outlet in study pod 12, inside a charcoal '
                           'felt sleeve with a braided USB-C cable.',
            "colour": "Charcoal",
            "brand": "Apple",
            "incident_date": (today - timedelta(days=3)).isoformat(),
            "incident_time": "18:10",
            "location_id": locations["Central Library"],
            "location_text": "Central Library — Study Pod 12",
            "custody_location": "Central Security Vault — Locker B4",
            "reporter_email": "security@alderton.edu",
            "custody_notes": "Intake photographed and sealed in evidence bag 44.",
        },
        [make_image("Found: charcoal sleeve laptop", (38, 42, 46))],
        officer_row,
    )

    create(
        {
            "report_type": "found",
            "title": "Saddle Tan Leather Messenger Bag",
            "category_id": categories["Bags & Luggage"],
            "description": "Weathered tan crossbody bag with brass buckle closures found on a courtyard "
                           "bench beside the architecture studios.",
            "colour": "Saddle Tan",
            "brand": "Fossil",
            "incident_date": (today - timedelta(days=2)).isoformat(),
            "incident_time": "11:15",
            "location_id": locations["Architecture Courtyard"],
            "custody_location": "North Gate Custody Desk — Shelf 02",
            "reporter_email": "faculty@alderton.edu",
        },
        [make_image("Tan leather messenger bag", (150, 110, 70))],
        faculty_row,
    )

    create(
        {
            "report_type": "lost",
            "title": "Tortoiseshell Prescription Eyeglasses",
            "category_id": categories["Accessories & Eyewear"],
            "description": "Round acetate frames in an olive-green hard clamshell case, left on a "
                           "cafeteria table during the lunch rush.",
            "colour": "Amber Tortoiseshell",
            "brand": "Ray-Ban",
            "confidential_marks": "-2.75 diopter lenses; micro-scratch on the right temple arm.",
            "incident_date": (today - timedelta(days=1)).isoformat(),
            "incident_time": "13:45",
            "location_id": locations["Student Commons"],
            "reporter_email": "diya.nair@alderton.edu",
            "reporter_phone": "+91 98119 30211",
        },
        [],
        pool.query_one("SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s", (student2,)),
    )

    found_headphones = create(
        {
            "report_type": "found",
            "title": "Sony WH-1000XM5 Wireless Headphones",
            "category_id": categories["Electronics"],
            "description": "Over-ear noise cancelling headphones in a fabric travel case, left on a "
                           "lecture hall seat after the evening session.",
            "colour": "Platinum Silver",
            "brand": "Sony",
            "incident_date": (today - timedelta(days=5)).isoformat(),
            "incident_time": "15:20",
            "location_id": locations["Science & Engineering Block"],
            "custody_location": "Central Security Vault — Locker A1",
            "reporter_email": "meera.joshi@alderton.edu",
        },
        [make_image("Sony headphones", (120, 124, 130))],
        pool.query_one("SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s", (security2,)),
    )

    create(
        {
            "report_type": "found",
            "title": "Brass Keyring with Dormitory Fob",
            "category_id": categories["Keys & Campus ID Cards"],
            "description": "Three brass keys on a navy woven lanyard with an RFID dormitory fob, handed "
                           "in after the inter-department athletics meet.",
            "colour": "Brass / Navy",
            "incident_date": (today - timedelta(days=8)).isoformat(),
            "incident_time": "17:50",
            "location_id": locations["Sports Complex"],
            "custody_location": "Central Security Vault — Locker A3",
            "reporter_email": "security@alderton.edu",
        },
        [],
        officer_row,
    )

    create(
        {
            "report_type": "lost",
            "title": "Casio Scientific Calculator FX-991",
            "category_id": categories["Books & Lab Equipment"],
            "description": "Black scientific calculator with a cracked corner and a name sticker on the "
                           "battery cover, lost after the physics practical.",
            "colour": "Black",
            "brand": "Casio",
            "incident_date": (today - timedelta(days=6)).isoformat(),
            "incident_time": "10:05",
            "location_id": locations["Science & Engineering Block"],
            "reporter_email": "diya.nair@alderton.edu",
        },
        [],
        pool.query_one("SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s", (student2,)),
    )

    # ------------------------------------------------------------------
    # End-to-end claim → verification → collection → handover demo
    # ------------------------------------------------------------------
    print("• Running claim → verification → return workflow…")
    matches = report_service.list_matches(alderton, status="suggested")
    laptop_found_id = found_laptop["report"]["id"]
    laptop_lost_id = lost_laptop["report"]["id"]
    match_id = None
    for item in matches["items"]:
        if item["found"]["id"] == laptop_found_id and item["lost"]["id"] == laptop_lost_id:
            match_id = item["id"]
            break

    claim = claim_service.submit_claim(
        alderton,
        student_row,
        found_report_id=laptop_found_id,
        identifying_answer=(
            "There is a small brass compass sticker to the left of the trackpad and the serial "
            "number ends in 9K4M. The lock screen wallpaper is a mountain ridge at sunrise."
        ),
        lost_report_id=laptop_lost_id,
        match_id=match_id,
        evidence_files=[(make_image("Purchase invoice (demo)", (60, 70, 96)), "invoice-demo.jpg")],
        evidence_note="Apple purchase invoice showing the serial number",
    )
    claim_service.review_claim(
        alderton, claim["id"], "start_review", admin_row, notes="Serial and sticker verified against intake photos."
    )
    claim_service.review_claim(
        alderton,
        claim["id"],
        "approve",
        admin_row,
        notes="Physical inspection matched confidential marks and serial suffix 9K4H.",
        verification_method="physical_inspection",
        findings="Compass sticker present; serial confirms ownership; claimant ID checked.",
    )
    ret = return_service.schedule_return(
        alderton,
        claim["id"],
        (datetime.now() + timedelta(days=2)).replace(hour=15, minute=30, second=0, microsecond=0).isoformat(),
        locations["Central Security Vault"],
        admin_row,
        instructions="Bring your campus ID card. Report to locker bay 2.",
    )
    return_service.confirm(alderton, ret["id"], "security_ready", officer_row, notes="Item retrieved from locker B4")
    return_service.confirm(alderton, ret["id"], "owner_confirm", student_row)

    # A second claim left pending so the officer queue is not empty.
    headphones_claim = claim_service.submit_claim(
        alderton,
        pool.query_one("SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=%s", (student2,)),
        found_report_id=found_headphones["report"]["id"],
        identifying_answer="A red thread is tied around the left headband slider and there is an airline adapter in the pouch.",
        evidence_note="Previous photo of the headphones on my desk",
        evidence_files=[(make_image("Old photo of headphones", (70, 80, 100)), "headphones-old.jpg")],
    )

    notify(
        alderton,
        admin,
        "demo_seed",
        "Demonstration data loaded",
        "This workspace contains clearly labelled demo records for the university project demonstration.",
    )
    print("\n✅ Demo data ready.\n")
    print("Demo sign-in credentials (password for all: Campus#2026)")
    print("  Platform admin  platform@lostfoundcampus.example")
    print("  University admin admin@alderton.edu")
    print("  Security officer security@alderton.edu   (also meera.joshi@alderton.edu)")
    print("  Student          student@alderton.edu    (verified)")
    print("  Student 2        diya.nair@alderton.edu")
    print("  Faculty          faculty@alderton.edu")
    print("  Pending student  ananya.d@alderton.edu   (verification pending)")
    print("  Staff in review  priya.sen@alderton.edu")
    print(f"\nSecond tenant admin: admin@vindhyatech.edu / {DEMO_PASSWORD}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo data for Lost & Found Campus")
    parser.add_argument("--reset", action="store_true", help="Delete existing demo data first")
    args = parser.parse_args()
    main(reset=args.reset)
