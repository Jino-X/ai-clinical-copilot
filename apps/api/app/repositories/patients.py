from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas.patients import (
    AllergyResponse,
    ConditionResponse,
    CreateAllergyRequest,
    CreateConditionRequest,
    CreateMedicationRequest,
    CreatePatientContactRequest,
    CreatePatientRequest,
    MedicationResponse,
    PatientContactResponse,
    PatientResponse,
    PatientSummary,
    TimelineEventResponse,
    UpdatePatientRequest,
)

_PATIENT_COLUMNS = """
  id, organization_id, first_name, last_name, date_of_birth, sex::text as sex,
  national_id, phone, email, address, city, state, postal_code, country,
  emergency_contact_name, emergency_contact_phone, notes,
  created_at, updated_at
"""


class PatientRepository:
    """Reads and writes `public.patients` and related medical-history tables.

    Every method takes a tenant connection so RLS is in force. The
    `organization_id` is set from the authenticated context, never from the
    request body (PRD §18).
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        payload: CreatePatientRequest,
    ) -> PatientResponse:
        row = await connection.fetchrow(
            f"""
            insert into public.patients
              (organization_id, first_name, last_name, date_of_birth, sex,
               national_id, phone, email, address, city, state, postal_code,
               country, emergency_contact_name, emergency_contact_phone, notes)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                    $14, $15, $16)
            returning {_PATIENT_COLUMNS}
            """,
            organization_id,
            payload.first_name.strip(),
            payload.last_name.strip(),
            payload.date_of_birth,
            payload.sex.value,
            payload.national_id,
            payload.phone,
            str(payload.email) if payload.email else None,
            payload.address,
            payload.city,
            payload.state,
            payload.postal_code,
            payload.country,
            payload.emergency_contact_name,
            payload.emergency_contact_phone,
            payload.notes,
        )
        return PatientResponse.model_validate(dict(row))

    async def get(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> PatientResponse | None:
        row = await connection.fetchrow(
            f"select {_PATIENT_COLUMNS} from public.patients where id = $1",
            patient_id,
        )
        return PatientResponse.model_validate(dict(row)) if row else None

    async def update(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        payload: UpdatePatientRequest,
    ) -> PatientResponse | None:
        # `coalesce` leaves omitted fields untouched, so a partial update
        # cannot silently blank out the other columns.
        row = await connection.fetchrow(
            f"""
            update public.patients set
              first_name = coalesce($2, first_name),
              last_name = coalesce($3, last_name),
              date_of_birth = coalesce($4, date_of_birth),
              sex = coalesce($5, sex),
              national_id = coalesce($6, national_id),
              phone = coalesce($7, phone),
              email = coalesce($8, email),
              address = coalesce($9, address),
              city = coalesce($10, city),
              state = coalesce($11, state),
              postal_code = coalesce($12, postal_code),
              country = coalesce($13, country),
              emergency_contact_name = coalesce($14, emergency_contact_name),
              emergency_contact_phone = coalesce($15, emergency_contact_phone),
              notes = coalesce($16, notes)
            where id = $1
            returning {_PATIENT_COLUMNS}
            """,
            patient_id,
            payload.first_name,
            payload.last_name,
            payload.date_of_birth,
            payload.sex,
            payload.national_id,
            payload.phone,
            str(payload.email) if payload.email else None,
            payload.address,
            payload.city,
            payload.state,
            payload.postal_code,
            payload.country,
            payload.emergency_contact_name,
            payload.emergency_contact_phone,
            payload.notes,
        )
        return PatientResponse.model_validate(dict(row)) if row else None

    async def soft_delete(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> bool:
        result = await connection.execute(
            "update public.patients set deleted_at = now() where id = $1",
            patient_id,
        )
        return result.endswith("1")

    async def list_patients(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PatientSummary]:
        rows = await connection.fetch(
            """
            select id, first_name, last_name, date_of_birth, sex::text as sex,
                   phone, email
              from public.patients
             where organization_id = $1
               and deleted_at is null
             order by last_name, first_name
             limit $2 offset $3
            """,
            organization_id,
            limit,
            offset,
        )
        return [PatientSummary.model_validate(dict(row)) for row in rows]

    async def search(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        query: str,
        limit: int = 20,
    ) -> list[PatientSummary]:
        # Trigram similarity search on first and last name. The % operator
        # uses the GIN indexes created in the migration.
        rows = await connection.fetch(
            """
            select id, first_name, last_name, date_of_birth, sex::text as sex,
                   phone, email
              from public.patients
             where organization_id = $1
               and deleted_at is null
               and (first_name % $2 or last_name % $2
                    or first_name ilike '%' || $2 || '%'
                    or last_name ilike '%' || $2 || '%')
             order by greatest(
                        similarity(first_name, $2),
                        similarity(last_name, $2)
                      ) desc
             limit $3
            """,
            organization_id,
            query.strip(),
            limit,
        )
        return [PatientSummary.model_validate(dict(row)) for row in rows]

    # --- Contacts ------------------------------------------------------------

    async def list_contacts(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> list[PatientContactResponse]:
        rows = await connection.fetch(
            """
            select id, patient_id, name, relationship, phone, email, notes
              from public.patient_contacts
             where patient_id = $1
             order by name
            """,
            patient_id,
        )
        return [PatientContactResponse.model_validate(dict(row)) for row in rows]

    async def add_contact(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        organization_id: UUID,
        payload: CreatePatientContactRequest,
    ) -> PatientContactResponse:
        row = await connection.fetchrow(
            """
            insert into public.patient_contacts
              (patient_id, organization_id, name, relationship, phone, email,
               notes)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, patient_id, name, relationship, phone, email, notes
            """,
            patient_id,
            organization_id,
            payload.name.strip(),
            payload.relationship,
            payload.phone,
            str(payload.email) if payload.email else None,
            payload.notes,
        )
        return PatientContactResponse.model_validate(dict(row))

    async def remove_contact(
        self, connection: asyncpg.Connection, *, contact_id: UUID
    ) -> bool:
        result = await connection.execute(
            "delete from public.patient_contacts where id = $1",
            contact_id,
        )
        return result.endswith("1")

    # --- Conditions ----------------------------------------------------------

    async def list_conditions(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> list[ConditionResponse]:
        rows = await connection.fetch(
            """
            select id, patient_id, name, status::text as status,
                   onset_date, resolved_date, notes, created_at::text as created_at
              from public.patient_conditions
             where patient_id = $1
             order by onset_date desc nulls last, created_at desc
            """,
            patient_id,
        )
        return [ConditionResponse.model_validate(dict(row)) for row in rows]

    async def add_condition(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        organization_id: UUID,
        created_by: UUID,
        payload: CreateConditionRequest,
    ) -> ConditionResponse:
        row = await connection.fetchrow(
            """
            insert into public.patient_conditions
              (patient_id, organization_id, name, status, onset_date,
               resolved_date, notes, created_by)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning id, patient_id, name, status::text as status,
                      onset_date, resolved_date, notes,
                      created_at::text as created_at
            """,
            patient_id,
            organization_id,
            payload.name.strip(),
            payload.status.value,
            payload.onset_date,
            payload.resolved_date,
            payload.notes,
            created_by,
        )
        return ConditionResponse.model_validate(dict(row))

    async def remove_condition(
        self, connection: asyncpg.Connection, *, condition_id: UUID
    ) -> bool:
        result = await connection.execute(
            "delete from public.patient_conditions where id = $1",
            condition_id,
        )
        return result.endswith("1")

    # --- Medications ---------------------------------------------------------

    async def list_medications(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> list[MedicationResponse]:
        rows = await connection.fetch(
            """
            select id, patient_id, name, dosage, frequency, route,
                   status::text as status, start_date, end_date, notes,
                   created_at::text as created_at
              from public.patient_medications
             where patient_id = $1
             order by start_date desc nulls last, created_at desc
            """,
            patient_id,
        )
        return [MedicationResponse.model_validate(dict(row)) for row in rows]

    async def add_medication(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        organization_id: UUID,
        created_by: UUID,
        payload: CreateMedicationRequest,
    ) -> MedicationResponse:
        row = await connection.fetchrow(
            """
            insert into public.patient_medications
              (patient_id, organization_id, name, dosage, frequency, route,
               status, start_date, end_date, notes, created_by)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            returning id, patient_id, name, dosage, frequency, route,
                      status::text as status, start_date, end_date, notes,
                      created_at::text as created_at
            """,
            patient_id,
            organization_id,
            payload.name.strip(),
            payload.dosage,
            payload.frequency,
            payload.route,
            payload.status.value,
            payload.start_date,
            payload.end_date,
            payload.notes,
            created_by,
        )
        return MedicationResponse.model_validate(dict(row))

    async def remove_medication(
        self, connection: asyncpg.Connection, *, medication_id: UUID
    ) -> bool:
        result = await connection.execute(
            "delete from public.patient_medications where id = $1",
            medication_id,
        )
        return result.endswith("1")

    # --- Allergies -----------------------------------------------------------

    async def list_allergies(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> list[AllergyResponse]:
        rows = await connection.fetch(
            """
            select id, patient_id, allergen, reaction,
                   severity::text as severity, notes,
                   created_at::text as created_at
              from public.patient_allergies
             where patient_id = $1
             order by created_at desc
            """,
            patient_id,
        )
        return [AllergyResponse.model_validate(dict(row)) for row in rows]

    async def add_allergy(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        organization_id: UUID,
        created_by: UUID,
        payload: CreateAllergyRequest,
    ) -> AllergyResponse:
        row = await connection.fetchrow(
            """
            insert into public.patient_allergies
              (patient_id, organization_id, allergen, reaction, severity,
               notes, created_by)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, patient_id, allergen, reaction,
                      severity::text as severity, notes,
                      created_at::text as created_at
            """,
            patient_id,
            organization_id,
            payload.allergen.strip(),
            payload.reaction,
            payload.severity.value if payload.severity else None,
            payload.notes,
            created_by,
        )
        return AllergyResponse.model_validate(dict(row))

    async def remove_allergy(
        self, connection: asyncpg.Connection, *, allergy_id: UUID
    ) -> bool:
        result = await connection.execute(
            "delete from public.patient_allergies where id = $1",
            allergy_id,
        )
        return result.endswith("1")

    # --- Timeline ------------------------------------------------------------

    async def list_timeline(
        self, connection: asyncpg.Connection, *, patient_id: UUID
    ) -> list[TimelineEventResponse]:
        rows = await connection.fetch(
            """
            select id, patient_id, event_type::text as event_type,
                   event_date, title, description, source_type, source_id,
                   created_at::text as created_at
              from public.patient_timeline_events
             where patient_id = $1
             order by event_date desc, created_at desc
            """,
            patient_id,
        )
        return [TimelineEventResponse.model_validate(dict(row)) for row in rows]
