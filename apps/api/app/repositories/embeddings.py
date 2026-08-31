from __future__ import annotations

from uuid import UUID

import asyncpg


class EmbeddingRepository:
    """Reads and writes `public.record_embeddings`.

    Every method takes a tenant connection so RLS is in force. Embeddings
    are scoped by organization_id and patient_id (PRD §10).
    """

    async def store(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        source_type: str,
        source_id: UUID,
        source_label: str,
        chunk_text: str,
        embedding: list[float],
        provider: str,
        model: str,
    ) -> None:
        """Store an embedding for a patient record chunk."""
        # Convert the embedding list to a pgvector string format.
        vector_str = "[" + ",".join(str(v) for v in embedding) + "]"
        await connection.execute(
            """
            insert into public.record_embeddings
              (organization_id, patient_id, source_type, source_id,
               source_label, chunk_text, embedding, provider, model)
            values ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9)
            """,
            organization_id,
            patient_id,
            source_type,
            source_id,
            source_label,
            chunk_text,
            vector_str,
            provider,
            model,
        )

    async def delete_for_source(
        self,
        connection: asyncpg.Connection,
        *,
        source_type: str,
        source_id: UUID,
    ) -> int:
        """Delete all embeddings for a given source record."""
        result = await connection.execute(
            """
            delete from public.record_embeddings
             where source_type = $1 and source_id = $2
            """,
            source_type,
            source_id,
        )
        # asyncpg returns "DELETE N" where N is the row count.
        return int(result.split()[-1]) if result else 0

    async def search_similar(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        query_embedding: list[float],
        limit: int = 10,
        similarity_threshold: float = 0.5,
    ) -> list[dict]:
        """Find the most similar record chunks for a patient.

        Uses cosine similarity (1 - cosine_distance). Results are always
        scoped by organization_id and patient_id (PRD §10).
        """
        vector_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
        rows = await connection.fetch(
            """
            select id, source_type, source_id, source_label, chunk_text,
                   1 - (embedding <=> $3::vector) as similarity
              from public.record_embeddings
             where organization_id = $1
               and patient_id = $2
               and 1 - (embedding <=> $3::vector) >= $4
             order by embedding <=> $3::vector
             limit $5
            """,
            organization_id,
            patient_id,
            vector_str,
            similarity_threshold,
            limit,
        )
        return [dict(row) for row in rows]

    async def count_for_patient(
        self,
        connection: asyncpg.Connection,
        *,
        patient_id: UUID,
    ) -> int:
        """Count embeddings for a patient."""
        result = await connection.fetchval(
            """
            select count(*) from public.record_embeddings
             where patient_id = $1
            """,
            patient_id,
        )
        return result or 0
