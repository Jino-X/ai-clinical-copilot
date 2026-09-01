#!/usr/bin/env python3
"""Seed test doctors and patients for local development.

This script creates test users in Supabase Auth, an organization, and
synthetic patients with medical history. It is for development only —
never run against a production database.

Usage:
    cd apps/api
    .venv/bin/python ../../scripts/seed_test_data.py

The script is idempotent: re-running it will skip users that already exist
and only create patients that don't yet exist in the organization.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import date
from uuid import UUID

import asyncpg


def parse_date(s: str | None) -> date | None:
    if s is None:
        return None
    return date.fromisoformat(s)

# --- Configuration ---------------------------------------------------------

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uajhwwmnyynyaskmstgp.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.uajhwwmnyynyaskmstgp:poothURAI%4080@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
)

ORG_NAME = "Test Clinic"

TEST_DOCTORS = [
    {
        "email": "dr.rajan@testclinic.dev",
        "password": "TestDoctor123!",
        "full_name": "Dr. Rajan Kumar",
    },
    {
        "email": "dr.priya@testclinic.dev",
        "password": "TestDoctor123!",
        "full_name": "Dr. Priya Sundaram",
    },
]

TEST_PATIENTS = [
    {
        "first_name": "Murugan",
        "last_name": "Subramanian",
        "date_of_birth": "1965-03-15",
        "sex": "male",
        "phone": "+91 98765 43210",
        "email": "murugan.s@example.com",
        "address": "12 Anna Salai, T Nagar",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "emergency_contact_name": "Lakshmi Subramanian",
        "emergency_contact_phone": "+91 98765 43211",
        "conditions": [
            {"name": "Type 2 Diabetes Mellitus", "status": "chronic", "onset_date": "2018-06-01", "notes": "Managed with metformin"},
            {"name": "Hypertension", "status": "active", "onset_date": "2020-01-15", "notes": "Stage 2"},
        ],
        "medications": [
            {"name": "Metformin", "dosage": "500mg", "frequency": "Twice daily", "route": "oral", "status": "active", "start_date": "2018-06-15"},
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "Once daily", "route": "oral", "status": "active", "start_date": "2020-01-20"},
        ],
        "allergies": [
            {"allergen": "Penicillin", "reaction": "Skin rash", "severity": "moderate"},
        ],
    },
    {
        "first_name": "Kavitha",
        "last_name": "Ramanathan",
        "date_of_birth": "1978-11-22",
        "sex": "female",
        "phone": "+91 90000 12345",
        "email": "kavitha.r@example.com",
        "address": "45 Mylapore, Luz Church Road",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "emergency_contact_name": "Suresh Ramanathan",
        "emergency_contact_phone": "+91 90000 12346",
        "conditions": [
            {"name": "Hypothyroidism", "status": "chronic", "onset_date": "2015-09-10", "notes": "Post-thyroidectomy"},
        ],
        "medications": [
            {"name": "Levothyroxine", "dosage": "75mcg", "frequency": "Once daily", "route": "oral", "status": "active", "start_date": "2015-09-15"},
        ],
        "allergies": [],
    },
    {
        "first_name": "Anbu",
        "last_name": "Arumugam",
        "date_of_birth": "1990-07-08",
        "sex": "male",
        "phone": "+91 88888 56789",
        "email": "anbu.a@example.com",
        "address": "78 Triplicane, Mosque Street",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "emergency_contact_name": "Saroja Arumugam",
        "emergency_contact_phone": "+91 88888 56790",
        "conditions": [
            {"name": "Asthma", "status": "active", "onset_date": "2010-04-01", "notes": "Exercise-induced"},
        ],
        "medications": [
            {"name": "Salbutamol Inhaler", "dosage": "100mcg", "frequency": "As needed", "route": "inhalation", "status": "active", "start_date": "2010-04-10"},
        ],
        "allergies": [
            {"allergen": "Dust mites", "reaction": "Asthma exacerbation", "severity": "mild"},
            {"allergen": "Sulfa drugs", "reaction": "Hives", "severity": "moderate"},
        ],
    },
]


async def create_auth_user(email: str, password: str, full_name: str) -> UUID | None:
    """Create a user in Supabase Auth via the admin API."""
    import urllib.request
    import json

    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    payload = json.dumps({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            user_id = UUID(data["id"])
            print(f"  Created auth user: {email} ({user_id})")
            return user_id
    except Exception as e:
        if hasattr(e, "code") and e.code == 400:
            # User might already exist — try to find them
            print(f"  User {email} may already exist: {e}")
        else:
            error_body = e.read().decode() if hasattr(e, "read") else str(e)
            if "already" in error_body.lower() or "exists" in error_body.lower():
                print(f"  User {email} already exists, looking up...")
                # List users to find the ID
                list_url = f"{SUPABASE_URL}/auth/v1/admin/users"
                list_req = urllib.request.Request(
                    list_url,
                    headers={
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    },
                    method="GET",
                )
                with urllib.request.urlopen(list_req) as resp:
                    users = json.loads(resp.read())
                    for u in users.get("users", []):
                        if u.get("email") == email:
                            user_id = UUID(u["id"])
                            print(f"  Found existing user: {email} ({user_id})")
                            return user_id
            else:
                print(f"  ERROR creating {email}: {error_body[:200]}")
                return None
    return None


async def seed():
    if not SUPABASE_SERVICE_ROLE_KEY:
        # Try to read from the backend .env
        env_path = os.path.join(os.path.dirname(__file__), "..", "apps", "api", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                        key = line.split("=", 1)[1].strip()
                        if not key.startswith("your-"):
                            globals()["SUPABASE_SERVICE_ROLE_KEY"] = key
                            break
        if not SUPABASE_SERVICE_ROLE_KEY:
            print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set.")
            print("Set it as an environment variable or in apps/api/.env")
            sys.exit(1)

    conn = await asyncpg.connect(dsn=DATABASE_URL, ssl="require", timeout=15)

    # 1. Create test doctors in Supabase Auth
    print("\n=== Creating test doctors ===")
    doctor_ids: list[tuple[UUID, str]] = []
    for doc in TEST_DOCTORS:
        user_id = await create_auth_user(doc["email"], doc["password"], doc["full_name"])
        if user_id is None:
            print(f"  Skipping {doc['email']} — could not create or find user")
            continue
        doctor_ids.append((user_id, doc["full_name"]))

    if not doctor_ids:
        print("\nNo doctors created. Exiting.")
        await conn.close()
        return

    # 2. Create or find the organization
    print("\n=== Setting up organization ===")
    org_row = await conn.fetchrow(
        "select id from public.organizations where name = $1", ORG_NAME
    )
    if org_row:
        org_id = org_row["id"]
        print(f"  Organization '{ORG_NAME}' already exists ({org_id})")
    else:
        # Create as the first doctor
        await conn.execute(
            "insert into public.organizations (name, created_by) values ($1, $2)",
            ORG_NAME,
            doctor_ids[0][0],
        )
        org_row = await conn.fetchrow(
            "select id from public.organizations where name = $1", ORG_NAME
        )
        org_id = org_row["id"]
        print(f"  Created organization '{ORG_NAME}' ({org_id})")

    # 3. Add all doctors as members of the organization
    print("\n=== Adding doctors to organization ===")
    for user_id, full_name in doctor_ids:
        existing = await conn.fetchval(
            "select 1 from public.organization_members where organization_id = $1 and user_id = $2",
            org_id,
            user_id,
        )
        if existing:
            print(f"  {full_name} is already a member")
        else:
            await conn.execute(
                "insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, 'doctor', 'active')",
                org_id,
                user_id,
            )
            print(f"  Added {full_name} as doctor")

    # 4. Update user_profiles with full_name
    print("\n=== Updating doctor profiles ===")
    for user_id, full_name in doctor_ids:
        await conn.execute(
            "update public.user_profiles set full_name = $2 where id = $1 and (full_name is null or full_name = '')",
            user_id,
            full_name,
        )

    # 5. Create test patients
    print("\n=== Creating test patients ===")
    for patient_data in TEST_PATIENTS:
        existing = await conn.fetchval(
            "select id from public.patients where organization_id = $1 and first_name = $2 and last_name = $3 and deleted_at is null",
            org_id,
            patient_data["first_name"],
            patient_data["last_name"],
        )
        if existing:
            print(f"  Patient {patient_data['first_name']} {patient_data['last_name']} already exists")
            continue

        row = await conn.fetchrow(
            """
            insert into public.patients (
                organization_id, first_name, last_name, date_of_birth, sex,
                phone, email, address, city, state, country,
                emergency_contact_name, emergency_contact_phone
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            returning id
            """,
            org_id,
            patient_data["first_name"],
            patient_data["last_name"],
            parse_date(patient_data["date_of_birth"]),
            patient_data["sex"],
            patient_data["phone"],
            patient_data["email"],
            patient_data["address"],
            patient_data["city"],
            patient_data["state"],
            patient_data["country"],
            patient_data["emergency_contact_name"],
            patient_data["emergency_contact_phone"],
        )
        patient_id = row["id"]
        print(f"  Created patient: {patient_data['first_name']} {patient_data['last_name']} ({patient_id})")

        # Add conditions
        for cond in patient_data.get("conditions", []):
            await conn.execute(
                """
                insert into public.patient_conditions
                    (patient_id, organization_id, name, status, onset_date, notes, created_by)
                values ($1, $2, $3, $4::public.condition_status, $5, $6, $7)
                """,
                patient_id,
                org_id,
                cond["name"],
                cond["status"],
                parse_date(cond.get("onset_date")),
                cond.get("notes"),
                doctor_ids[0][0],
            )

        # Add medications
        for med in patient_data.get("medications", []):
            await conn.execute(
                """
                insert into public.patient_medications
                    (patient_id, organization_id, name, dosage, frequency, route, status, start_date, created_by)
                values ($1, $2, $3, $4, $5, $6, $7::public.medication_status, $8, $9)
                """,
                patient_id,
                org_id,
                med["name"],
                med.get("dosage"),
                med.get("frequency"),
                med.get("route"),
                med["status"],
                parse_date(med.get("start_date")),
                doctor_ids[0][0],
            )

        # Add allergies
        for allergy in patient_data.get("allergies", []):
            await conn.execute(
                """
                insert into public.patient_allergies
                    (patient_id, organization_id, allergen, reaction, severity, created_by)
                values ($1, $2, $3, $4, $5::public.allergy_severity, $6)
                """,
                patient_id,
                org_id,
                allergy["allergen"],
                allergy.get("reaction"),
                allergy.get("severity"),
                doctor_ids[0][0],
            )

    # 6. Summary
    print("\n=== Summary ===")
    member_count = await conn.fetchval(
        "select count(*) from public.organization_members where organization_id = $1 and status = 'active'",
        org_id,
    )
    patient_count = await conn.fetchval(
        "select count(*) from public.patients where organization_id = $1 and deleted_at is null",
        org_id,
    )
    print(f"  Organization: {ORG_NAME}")
    print(f"  Doctors: {member_count}")
    print(f"  Patients: {patient_count}")
    print(f"\n  Test doctor credentials:")
    for doc in TEST_DOCTORS:
        print(f"    {doc['email']} / {doc['password']}")

    await conn.close()
    print("\nDone! You can now log in with any test doctor account.")


if __name__ == "__main__":
    asyncio.run(seed())
