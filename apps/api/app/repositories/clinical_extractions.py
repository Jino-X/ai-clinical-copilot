from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg


class ClinicalExtractionRepository:
    """Reads and writes `public.clinical_extractions`.

    Stores structured clinical extractions from consultation transcripts.
    The original transcript is never modified (PRD §4). All AI output is a
    draft for doctor review.
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID,
        patient_id: UUID,
        transcript_id: UUID,
        extraction: dict[str, Any],
        input_text: str,
        provider: str,
        model: str,
    ) -> dict[str, Any]:
        import json

        row = await connection.fetchrow(
            """
            insert into public.clinical_extractions
              (organization_id, consultation_id, patient_id, transcript_id,
               extraction, input_text, provider, model)
            values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
            returning id, organization_id, consultation_id, patient_id,
                      transcript_id, extraction, input_text, provider, model,
                      created_at::text as created_at
            """,
            organization_id,
            consultation_id,
            patient_id,
            transcript_id,
            json.dumps(extraction),
            input_text,
            provider,
            model,
        )
        return dict(row)

    async def get_by_consultation(
        self, connection: asyncpg.Connection, *, consultation_id: UUID
    ) -> dict[str, Any] | None:
        row = await connection.fetchrow(
            """
            select id, organization_id, consultation_id, patient_id,
                   transcript_id, extraction, input_text, provider, model,
                   created_at::text as created_at
              from public.clinical_extractions
             where consultation_id = $1
             order by created_at desc
             limit 1
            """,
            consultation_id,
        )
        return dict(row) if row else None
