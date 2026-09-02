from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas.clinical_notes import (
    ClinicalNoteResponse,
    ClinicalNoteSummary,
    EditNoteRequest,
    NoteStatus,
    NoteVersionSource,
    SoapNoteResponse,
)

_NOTE_COLUMNS = """
  id, organization_id, consultation_id, patient_id, status::text as status,
  current_version, approved_by, approved_at::text as approved_at,
  created_at::text as created_at, updated_at::text as updated_at
"""

_VERSION_COLUMNS = """
  id, organization_id, clinical_note_id, version,
  source::text as source, subjective, objective, assessment, plan, follow_up,
  authored_by, edit_note, created_at::text as created_at
"""


class ClinicalNoteRepository:
    """Reads and writes clinical notes and their versions.

    Versions are immutable: every edit or approval creates a new row
    (PRD §23). The note's `current_version` is incremented to point at the
    latest version.
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID,
        patient_id: UUID,
        soap_content: dict[str, str | None],
    ) -> ClinicalNoteResponse:
        """Create a clinical note with its first (AI-generated) version."""
        async with connection.transaction():
            note_row = await connection.fetchrow(
                f"""
                insert into public.clinical_notes
                  (organization_id, consultation_id, patient_id, status,
                   current_version)
                values ($1, $2, $3, 'draft', 1)
                returning {_NOTE_COLUMNS}
                """,
                organization_id,
                consultation_id,
                patient_id,
            )

            note_id = note_row["id"]
            await connection.fetchrow(
                f"""
                insert into public.clinical_note_versions
                  (organization_id, clinical_note_id, version, source,
                   subjective, objective, assessment, plan, follow_up,
                   authored_by)
                values ($1, $2, 1, 'ai_generated', $3, $4, $5, $6, $7, $8)
                returning {_VERSION_COLUMNS}
                """,
                organization_id,
                note_id,
                soap_content.get("subjective"),
                soap_content.get("objective"),
                soap_content.get("assessment"),
                soap_content.get("plan"),
                soap_content.get("follow_up"),
                # AI-generated versions have no human author; use a sentinel
                # that the RLS policy allows. The service layer passes the
                # requesting user's ID as the author for traceability.
                organization_id,  # placeholder; service sets authored_by
            )

        return await self.get(connection, note_id=note_id)  # type: ignore[return-value]

    async def create_with_author(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID,
        patient_id: UUID,
        soap_content: dict[str, str | None],
        authored_by: UUID,
    ) -> ClinicalNoteResponse:
        """Create a clinical note with its first (AI-generated) version,
        recording the user who triggered the generation as the author.
        """
        async with connection.transaction():
            note_row = await connection.fetchrow(
                f"""
                insert into public.clinical_notes
                  (organization_id, consultation_id, patient_id, status,
                   current_version)
                values ($1, $2, $3, 'draft', 1)
                returning {_NOTE_COLUMNS}
                """,
                organization_id,
                consultation_id,
                patient_id,
            )

            note_id = note_row["id"]
            await connection.fetchrow(
                f"""
                insert into public.clinical_note_versions
                  (organization_id, clinical_note_id, version, source,
                   subjective, objective, assessment, plan, follow_up,
                   authored_by)
                values ($1, $2, 1, 'ai_generated', $3, $4, $5, $6, $7, $8)
                returning {_VERSION_COLUMNS}
                """,
                organization_id,
                note_id,
                soap_content.get("subjective"),
                soap_content.get("objective"),
                soap_content.get("assessment"),
                soap_content.get("plan"),
                soap_content.get("follow_up"),
                authored_by,
            )

        return await self.get(connection, note_id=note_id)  # type: ignore[return-value]

    async def get(
        self, connection: asyncpg.Connection, *, note_id: UUID
    ) -> ClinicalNoteResponse | None:
        note_row = await connection.fetchrow(
            f"select {_NOTE_COLUMNS} from public.clinical_notes where id = $1",
            note_id,
        )
        if note_row is None:
            return None

        # Fetch the latest version.
        version_row = await connection.fetchrow(
            f"""
            select {_VERSION_COLUMNS}
              from public.clinical_note_versions
             where clinical_note_id = $1
             order by version desc
             limit 1
            """,
            note_id,
        )

        latest_version = (
            SoapNoteResponse.model_validate(dict(version_row)) if version_row else None
        )

        response = ClinicalNoteResponse.model_validate(dict(note_row))
        response.latest_version = latest_version
        return response

    async def get_by_consultation(
        self, connection: asyncpg.Connection, *, consultation_id: UUID
    ) -> ClinicalNoteResponse | None:
        row = await connection.fetchrow(
            "select id from public.clinical_notes where consultation_id = $1",
            consultation_id,
        )
        if row is None:
            return None
        return await self.get(connection, note_id=row["id"])

    async def add_version(
        self,
        connection: asyncpg.Connection,
        *,
        note_id: UUID,
        organization_id: UUID,
        source: NoteVersionSource,
        authored_by: UUID,
        content: EditNoteRequest,
    ) -> ClinicalNoteResponse | None:
        """Add a new version to an existing note. The note's current_version
        is incremented and status is updated (PRD §23).
        """
        async with connection.transaction():
            # Lock the note row to prevent concurrent version conflicts.
            note_row = await connection.fetchrow(
                f"""
                select {_NOTE_COLUMNS} from public.clinical_notes
                 where id = $1
                 for update
                """,
                note_id,
            )
            if note_row is None:
                return None

            new_version = note_row["current_version"] + 1

            # Fetch the previous version's content so omitted fields are
            # carried forward (partial update semantics).
            prev_row = await connection.fetchrow(
                """
                select subjective, objective, assessment, plan, follow_up
                  from public.clinical_note_versions
                 where clinical_note_id = $1
                 order by version desc
                 limit 1
                """,
                note_id,
            )

            await connection.execute(
                """
                insert into public.clinical_note_versions
                  (organization_id, clinical_note_id, version, source,
                   subjective, objective, assessment, plan, follow_up,
                   authored_by, edit_note)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                organization_id,
                note_id,
                new_version,
                source.value,
                content.subjective
                if content.subjective is not None
                else prev_row["subjective"],
                content.objective
                if content.objective is not None
                else prev_row["objective"],
                content.assessment
                if content.assessment is not None
                else prev_row["assessment"],
                content.plan if content.plan is not None else prev_row["plan"],
                content.follow_up
                if content.follow_up is not None
                else prev_row["follow_up"],
                authored_by,
                content.edit_note,
            )

            # Update the note's current_version and status.
            new_status = (
                NoteStatus.APPROVED.value
                if source is NoteVersionSource.DOCTOR_APPROVED
                else NoteStatus.IN_REVIEW.value
            )

            if source is NoteVersionSource.DOCTOR_APPROVED:
                await connection.execute(
                    """
                    update public.clinical_notes
                       set current_version = $2,
                           status = $3,
                           approved_by = $4,
                           approved_at = now()
                     where id = $1
                    """,
                    note_id,
                    new_version,
                    new_status,
                    authored_by,
                )
            else:
                await connection.execute(
                    """
                    update public.clinical_notes
                       set current_version = $2,
                           status = $3
                     where id = $1
                    """,
                    note_id,
                    new_version,
                    new_status,
                )

        return await self.get(connection, note_id=note_id)

    async def reject(
        self,
        connection: asyncpg.Connection,
        *,
        note_id: UUID,
        rejected_by: UUID,
    ) -> ClinicalNoteResponse | None:
        row = await connection.fetchrow(
            f"""
            update public.clinical_notes
               set status = 'rejected'
             where id = $1 and status in ('draft', 'in_review')
            returning {_NOTE_COLUMNS}
            """,
            note_id,
        )
        if row is None:
            return None
        response = ClinicalNoteResponse.model_validate(dict(row))
        return response

    async def list_versions(
        self, connection: asyncpg.Connection, *, note_id: UUID
    ) -> list[SoapNoteResponse]:
        rows = await connection.fetch(
            f"""
            select {_VERSION_COLUMNS}
              from public.clinical_note_versions
             where clinical_note_id = $1
             order by version desc
            """,
            note_id,
        )
        return [SoapNoteResponse.model_validate(dict(row)) for row in rows]

    async def list_for_organization(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ClinicalNoteSummary]:
        rows = await connection.fetch(
            """
            select id, consultation_id, patient_id, status::text as status,
                   current_version, created_at::text as created_at
              from public.clinical_notes
             where organization_id = $1
             order by created_at desc
             limit $2 offset $3
            """,
            organization_id,
            limit,
            offset,
        )
        return [ClinicalNoteSummary.model_validate(dict(row)) for row in rows]
