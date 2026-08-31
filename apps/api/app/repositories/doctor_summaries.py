from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg


class DoctorSummaryRepository:
    """Reads and writes `public.doctor_summaries`.

    Stores doctor-facing summaries generated from verified patient data and
    current consultation extractions. Summaries are drafts for doctor review.
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID,
        patient_id: UUID,
        summary: str,
        source_references: list[str],
        provider: str,
        model: str,
    ) -> dict[str, Any]:
        row = await connection.fetchrow(
            """
            insert into public.doctor_summaries
              (organization_id, consultation_id, patient_id, summary,
               source_references, provider, model)
            values ($1, $2, $3, $4, $5::jsonb, $6, $7)
            returning id, organization_id, consultation_id, patient_id,
                      summary, source_references, provider, model,
                      created_at::text as created_at
            """,
            organization_id,
            consultation_id,
            patient_id,
            summary,
            json.dumps(source_references),
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
                   summary, source_references, provider, model,
                   created_at::text as created_at
              from public.doctor_summaries
             where consultation_id = $1
             order by created_at desc
             limit 1
            """,
            consultation_id,
        )
        return dict(row) if row else None
