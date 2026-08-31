from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg


class TranscriptRepository:
    """Reads and writes `public.transcripts` and `public.transcript_segments`.

    Transcripts are written by the backend (the transcription pipeline) using
    a privileged connection because `authenticated` has no INSERT grant on
    transcripts. The original transcript is never overwritten by AI output
    (PRD §4, §12).
    """

    async def create(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        consultation_id: UUID,
        full_text: str,
        provider: str,
        model: str,
        language: str | None = None,
        duration_seconds: int | None = None,
        has_speaker_labels: bool = False,
    ) -> dict[str, Any]:
        """Insert a transcript row. Returns the row as a dict."""
        row = await connection.fetchrow(
            """
            insert into public.transcripts
              (organization_id, consultation_id, full_text, provider,
               language, duration_seconds, has_speaker_labels)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, organization_id, consultation_id, full_text,
                      provider, language, duration_seconds,
                      has_speaker_labels,
                      created_at::text as created_at
            """,
            organization_id,
            consultation_id,
            full_text,
            f"{provider}:{model}",
            language,
            duration_seconds,
            has_speaker_labels,
        )
        return dict(row)

    async def get_by_consultation(
        self, connection: asyncpg.Connection, *, consultation_id: UUID
    ) -> dict[str, Any] | None:
        row = await connection.fetchrow(
            """
            select id, organization_id, consultation_id, full_text,
                   provider, language, duration_seconds, has_speaker_labels,
                   english_text, english_provider, english_model,
                   english_source_language,
                   english_created_at::text as english_created_at,
                   created_at::text as created_at
              from public.transcripts
             where consultation_id = $1
             order by created_at desc
             limit 1
            """,
            consultation_id,
        )
        return dict(row) if row else None

    async def update_english_text(
        self,
        connection: asyncpg.Connection,
        *,
        transcript_id: UUID,
        english_text: str,
        provider: str,
        model: str,
        source_language: str | None = None,
    ) -> dict[str, Any] | None:
        """Update the English-normalized text on an existing transcript.

        The original full_text is never modified (PRD §4). Only the
        English-normalized fields are updated.
        """
        row = await connection.fetchrow(
            """
            update public.transcripts
               set english_text = $2,
                   english_provider = $3,
                   english_model = $4,
                   english_source_language = $5,
                   english_created_at = now()
             where id = $1
            returning id, organization_id, consultation_id, full_text,
                      provider, language, duration_seconds, has_speaker_labels,
                      english_text, english_provider, english_model,
                      english_source_language,
                      english_created_at::text as english_created_at,
                      created_at::text as created_at
            """,
            transcript_id,
            english_text,
            provider,
            model,
            source_language,
        )
        return dict(row) if row else None
