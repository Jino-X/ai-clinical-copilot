from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import asyncpg

from app.providers.embedding.base import EmbeddingProvider
from app.repositories.embeddings import EmbeddingRepository


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    """A single retrieved chunk with its source reference."""
    source_type: str
    source_id: UUID
    source_label: str
    chunk_text: str
    similarity: float
    match_type: str  # "vector" or "keyword"


class RagService:
    """Hybrid retrieval for patient-scoped RAG (PRD §10).

    Combines:
    1. Vector similarity search (semantic matching via pgvector)
    2. Keyword search (exact term matching via ILIKE)

    Results are always scoped by organization_id and patient_id (PRD §10).
    Source references are included with every result (PRD §10).
    """

    def __init__(self, embedding_provider: EmbeddingProvider) -> None:
        self._provider = embedding_provider
        self._embedding_repo = EmbeddingRepository()

    async def retrieve(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        query: str,
        limit: int = 10,
        similarity_threshold: float = 0.3,
    ) -> list[RetrievalResult]:
        """Hybrid retrieval: combine vector and keyword search results.

        Returns deduplicated results sorted by relevance.
        """
        # --- Vector search -------------------------------------------------
        query_embedding = await self._provider.embed(text=query)

        vector_results = await self._embedding_repo.search_similar(
            connection,
            organization_id=organization_id,
            patient_id=patient_id,
            query_embedding=query_embedding.vector,
            limit=limit,
            similarity_threshold=similarity_threshold,
        )

        # --- Keyword search ------------------------------------------------
        keyword_results = await self._keyword_search(
            connection,
            organization_id=organization_id,
            patient_id=patient_id,
            query=query,
            limit=limit,
        )

        # --- Merge and deduplicate -----------------------------------------
        seen: set[tuple[str, str]] = set()
        merged: list[RetrievalResult] = []

        # Vector results first (higher confidence).
        for row in vector_results:
            key = (row["source_type"], str(row["source_id"]))
            if key not in seen:
                seen.add(key)
                merged.append(
                    RetrievalResult(
                        source_type=row["source_type"],
                        source_id=row["source_id"],
                        source_label=row["source_label"],
                        chunk_text=row["chunk_text"],
                        similarity=float(row["similarity"]),
                        match_type="vector",
                    )
                )

        # Then keyword results.
        for row in keyword_results:
            key = (row["source_type"], str(row["source_id"]))
            if key not in seen:
                seen.add(key)
                merged.append(
                    RetrievalResult(
                        source_type=row["source_type"],
                        source_id=row["source_id"],
                        source_label=row["source_label"],
                        chunk_text=row["chunk_text"],
                        similarity=0.0,
                        match_type="keyword",
                    )
                )

        return merged[:limit]

    async def _keyword_search(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        patient_id: UUID,
        query: str,
        limit: int,
    ) -> list[dict]:
        """Keyword search via ILIKE on chunk_text."""
        # Escape SQL wildcards in the query.
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace(
            "_", "\\_"
        )
        pattern = f"%{escaped}%"
        rows = await connection.fetch(
            """
            select source_type, source_id, source_label, chunk_text
              from public.record_embeddings
             where organization_id = $1
               and patient_id = $2
               and chunk_text ilike $3
             limit $4
            """,
            organization_id,
            patient_id,
            pattern,
            limit,
        )
        return [dict(row) for row in rows]

    def build_context(self, results: list[RetrievalResult]) -> str:
        """Build a text context from retrieval results for the LLM.

        Includes source references so the LLM can cite them (PRD §10).
        """
        if not results:
            return "No relevant patient records found."

        sections: list[str] = []
        for i, r in enumerate(results, 1):
            section = (
                f"[Source {i}: {r.source_label} "
                f"({r.source_type}, match: {r.match_type})]\n"
                f"{r.chunk_text}"
            )
            sections.append(section)

        return "\n\n".join(sections)

    def build_source_references(
        self, results: list[RetrievalResult]
    ) -> list[str]:
        """Build a list of source reference labels for the LLM response."""
        return [
            f"{r.source_label} ({r.source_type}, match: {r.match_type})"
            for r in results
        ]
