from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmbeddingResponse:
    """The output of an embedding call."""

    vector: list[float]
    provider: str
    model: str


class EmbeddingProvider(ABC):
    """Abstract interface for embedding providers (PRD §11).

    Implementations generate dense vector embeddings from text. These
    embeddings are stored in pgvector for RAG retrieval (PRD §10).
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def model(self) -> str: ...

    @property
    @abstractmethod
    def dimensions(self) -> int: ...

    @abstractmethod
    async def embed(self, *, text: str) -> EmbeddingResponse: ...

    @abstractmethod
    async def embed_batch(self, *, texts: list[str]) -> list[EmbeddingResponse]: ...
