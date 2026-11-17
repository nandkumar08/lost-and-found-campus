
from getpass import getpass

from app.database.pool import pool
from app.security import hash_password

EMAIL = "admin@gmail.com"
NAME = "University Administrator"


def main():
    university = pool.query_one(
        "SELECT id FROM universities WHERE code=%s AND deleted_at IS NULL",
        ("ADTU",)
    )

    if not university:
        print("ADTU university not found. Check the university code.")
        return

    role = pool.query_one(
        "SELECT id FROM roles WHERE code=%s",
        ("university_admin",)
    )

    if not role:
        print("University admin role not found.")
        return

    existing = pool.query_one(
        "SELECT id FROM users WHERE email=%s",
        (EMAIL,)
    )

    if existing:
        print("This email already exists. No changes made.")
        return

    password = getpass("Create Admin password: ")
    confirm = getpass("Confirm Admin password: ")

    if password != confirm:
        print("Passwords do not match.")
        return

    if len(password) < 8 or not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        print("Use at least 8 characters, including a letter and a number.")
        return

    pool.execute(
        """
        INSERT INTO users (
            university_id, role_id, full_name, email,
            password_hash, designation, account_status,
            email_verified_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, 'active', NOW())
        """,
        (
            university["id"],
            role["id"],
            NAME,
            EMAIL,
            hash_password(password),
            "University Administrator"
        )
    )

    print("ADTU University Admin account created successfully!")


if __name__ == "__main__":
    main()
