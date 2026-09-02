from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.embedding.base import EmbeddingProvider, EmbeddingResponse

logger = get_logger(__name__)

# nomic-embed-text produces 768-dimensional vectors.
_DEFAULT_MODEL = "nomic-embed-text"
_DEFAULT_DIMENSIONS = 768


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama embedding provider using nomic-embed-text.

    Generates 768-dimensional embeddings for RAG retrieval (PRD §10).
    Runs entirely locally via Ollama — no API key required.
    """

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url
        self._model = settings.ollama_embedding_model
        self._timeout = settings.ollama_timeout_seconds
        self._dimensions = settings.ollama_embedding_dimensions

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, *, text: str) -> EmbeddingResponse:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/api/embed",
                headers={"Content-Type": "application/json"},
                json={
                    "model": self._model,
                    "input": text,
                },
            )

        if response.status_code != 200:
            logger.error(
                "ollama_embedding_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Embedding service failed")

        body = response.json()
        vector = body["embeddings"][0]

        return EmbeddingResponse(
            vector=vector,
            provider=self.name,
            model=self._model,
        )

    async def embed_batch(self, *, texts: list[str]) -> list[EmbeddingResponse]:
        if not texts:
            return []

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/api/embed",
                headers={"Content-Type": "application/json"},
                json={
                    "model": self._model,
                    "input": texts,
                },
            )

        if response.status_code != 200:
            logger.error(
                "ollama_embedding_batch_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Embedding service failed")

        body = response.json()
        # Ollama returns embeddings in the same order as the input.
        results = [
            EmbeddingResponse(
                vector=vec,
                provider=self.name,
                model=self._model,
            )
            for vec in body["embeddings"]
        ]

        return results
