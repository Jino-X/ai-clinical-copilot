from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas.consultations import (
    ConsentResponse,
    ConsultationResponse,
    ConsultationStatus,
    ConsultationSummary,
    CreateConsultationRequest,
    GrantConsentRequest,
    UpdateConsultationRequest,
)

_CONSULTATION_COLUMNS = """
  id, organization_id, patient_id, doctor_id, status::text as status,
  chief_complaint, started_at, ended_at, duration_seconds,
  audio_storage_path, audio_content_type, audio_size_bytes,
  doctor_summary, created_at, updated_at
"""

_CONSULTATION_SUMMARY_COLUMNS = """
  id, patient_id, doctor_id, status::text as status,
  chief_complaint, started_at, ended_at, duration_seconds, created_at
"""


class ConsultationRepository:
    """Reads and writes `public.consultations` and `public.consents`.

    Every method takes a tenant connection so RLS is in force. The
    `doctor_id` and `organization_id` are set from the authenticated context,
    never from the request body (PRD §18).
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        doctor_id: UUID,
        payload: CreateConsultationRequest,
    ) -> ConsultationResponse:
        row = await connection.fetchrow(
            f"""
            insert into public.consultations
              (organization_id, patient_id, doctor_id, chief_complaint)
            values ($1, $2, $3, $4)
            returning {_CONSULTATION_COLUMNS}
            """,
            organization_id,
            patient_id,
            doctor_id,
            payload.chief_complaint,
        )
        return ConsultationResponse.model_validate(dict(row))

    async def get(
        self, connection: asyncpg.Connection, *, consultation_id: UUID
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"select {_CONSULTATION_COLUMNS} from public.consultations where id = $1",
            consultation_id,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def update(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
        payload: UpdateConsultationRequest,
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.consultations set
              chief_complaint = coalesce($2, chief_complaint),
              doctor_summary = coalesce($3, doctor_summary)
            where id = $1
            returning {_CONSULTATION_COLUMNS}
            """,
            consultation_id,
            payload.chief_complaint,
            payload.doctor_summary,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def start(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.consultations
               set status = 'in_progress',
                   started_at = coalesce(started_at, now())
             where id = $1 and status = 'scheduled'
            returning {_CONSULTATION_COLUMNS}
            """,
            consultation_id,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def complete(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.consultations
               set status = 'completed',
                   ended_at = now(),
                   duration_seconds = extract(epoch from (
                     coalesce(ended_at, now()) - coalesce(started_at, now())
                   ))::int
             where id = $1 and status = 'in_progress'
            returning {_CONSULTATION_COLUMNS}
            """,
            consultation_id,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def cancel(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.consultations
               set status = 'cancelled',
                   ended_at = now()
             where id = $1 and status in ('scheduled', 'in_progress')
            returning {_CONSULTATION_COLUMNS}
            """,
            consultation_id,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def attach_audio(
        self,
        connection: asyncpg.Connection,
        *,
        consultation_id: UUID,
        storage_path: str,
        content_type: str,
        file_size_bytes: int,
    ) -> ConsultationResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.consultations
               set audio_storage_path = $2,
                   audio_content_type = $3,
                   audio_size_bytes = $4
             where id = $1
            returning {_CONSULTATION_COLUMNS}
            """,
            consultation_id,
            storage_path,
            content_type,
            file_size_bytes,
        )
        return ConsultationResponse.model_validate(dict(row)) if row else None

    async def list_for_patient(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ConsultationSummary]:
        rows = await connection.fetch(
            f"""
            select {_CONSULTATION_SUMMARY_COLUMNS}
              from public.consultations
             where patient_id = $1
             order by created_at desc
             limit $2 offset $3
            """,
            patient_id,
            limit,
            offset,
        )
        return [ConsultationSummary.model_validate(dict(row)) for row in rows]

    async def list_for_organization(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        status: ConsultationStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ConsultationSummary]:
        if status is not None:
            rows = await connection.fetch(
                f"""
                select {_CONSULTATION_SUMMARY_COLUMNS}
                  from public.consultations
                 where organization_id = $1 and status = $2
                 order by created_at desc
                 limit $3 offset $4
                """,
                organization_id,
                status.value,
                limit,
                offset,
            )
        else:
            rows = await connection.fetch(
                f"""
                select {_CONSULTATION_SUMMARY_COLUMNS}
                  from public.consultations
                 where organization_id = $1
                 order by created_at desc
                 limit $2 offset $3
                """,
                organization_id,
                limit,
                offset,
            )
        return [ConsultationSummary.model_validate(dict(row)) for row in rows]

    # --- Consent -------------------------------------------------------------

    async def grant_consent(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        recorded_by: UUID,
        payload: GrantConsentRequest,
    ) -> ConsentResponse:
        row = await connection.fetchrow(
            """
            insert into public.consents
              (organization_id, patient_id, consultation_id, consent_type,
               granted, recorded_by, notes)
            values ($1, $2, $3, $4, true, $5, $6)
            returning id, organization_id, patient_id, consultation_id,
                      consent_type::text as consent_type, granted,
                      recorded_by, notes, created_at::text as created_at
            """,
            organization_id,
            payload.patient_id,
            payload.consultation_id,
            payload.consent_type.value,
            recorded_by,
            payload.notes,
        )
        return ConsentResponse.model_validate(dict(row))

    async def revoke_consent(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        recorded_by: UUID,
        payload: GrantConsentRequest,
    ) -> ConsentResponse:
        # Revocation inserts a new row with granted = false. The history is
        # append-only (PRD §18, §19).
        row = await connection.fetchrow(
            """
            insert into public.consents
              (organization_id, patient_id, consultation_id, consent_type,
               granted, recorded_by, notes)
            values ($1, $2, $3, $4, false, $5, $6)
            returning id, organization_id, patient_id, consultation_id,
                      consent_type::text as consent_type, granted,
                      recorded_by, notes, created_at::text as created_at
            """,
            organization_id,
            payload.patient_id,
            payload.consultation_id,
            payload.consent_type.value,
            recorded_by,
            payload.notes,
        )
        return ConsentResponse.model_validate(dict(row))

    async def list_consents(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
    ) -> list[ConsentResponse]:
        rows = await connection.fetch(
            """
            select id, organization_id, patient_id, consultation_id,
                   consent_type::text as consent_type, granted,
                   recorded_by, notes, created_at::text as created_at
              from public.consents
             where patient_id = $1
             order by created_at desc
            """,
            patient_id,
        )
        return [ConsentResponse.model_validate(dict(row)) for row in rows]

    async def has_active_consent(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
        consent_type: str,
    ) -> bool:
        """Check if the patient has an active (granted, not revoked) consent.

        The latest row for this consent type determines the current state.
        """
        row = await connection.fetchrow(
            """
            select granted from public.consents
             where patient_id = $1
               and consent_type = $2::public.consent_type
             order by created_at desc
             limit 1
            """,
            patient_id,
            consent_type,
        )
        return bool(row and row["granted"])
