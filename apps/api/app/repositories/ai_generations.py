from __future__ import annotations

from uuid import UUID

import asyncpg


class AiGenerationRepository:
    """Records AI generation calls for audit and status tracking.

    Written with a privileged connection because `authenticated` has no
    INSERT grant on ai_generations. Stores metadata only — never clinical
    content, prompts, or full responses (PRD §19).
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID | None = None,
        clinical_note_id: UUID | None = None,
        task_type: str,
        provider: str,
        model: str | None = None,
    ) -> UUID:
        row = await connection.fetchrow(
            """
            insert into public.ai_generations
              (organization_id, consultation_id, clinical_note_id,
               task_type, provider, model, status)
            values ($1, $2, $3, $4, $5, $6, 'pending')
            returning id
            """,
            organization_id,
            consultation_id,
            clinical_note_id,
            task_type,
            provider,
            model,
        )
        return UUID(str(row["id"]))

    async def mark_completed(
        self,
        connection: asyncpg.Connection,
        *,
        generation_id: UUID,
        duration_ms: int | None = None,
    ) -> None:
        await connection.execute(
            """
            update public.ai_generations
               set status = 'completed',
                   duration_ms = $2
             where id = $1
            """,
            generation_id,
            duration_ms,
        )

    async def mark_failed(
        self,
        connection: asyncpg.Connection,
        *,
        generation_id: UUID,
        error_message: str,
    ) -> None:
        await connection.execute(
            """
            update public.ai_generations
               set status = 'failed',
                   error_message = $2
             where id = $1
            """,
            generation_id,
            error_message[:500],  # Truncate to avoid storing large errors
        )
