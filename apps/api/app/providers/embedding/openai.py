from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.embedding.base import EmbeddingProvider, EmbeddingResponse

logger = get_logger(__name__)

_OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings"
_DEFAULT_MODEL = "text-embedding-3-small"
_DEFAULT_DIMENSIONS = 1536


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider using text-embedding-3-small.

    Generates 1536-dimensional embeddings for RAG retrieval (PRD §10).
    The model and dimensions are configurable for testing or cost control.
    """

    def __init__(self, settings: Settings) -> None:
        self._api_key = (
            settings.openai_api_key.get_secret_value()
            if settings.openai_api_key
            else None
        )
        self._model = settings.openai_embedding_model
        self._dimensions = settings.openai_embedding_dimensions

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, *, text: str) -> EmbeddingResponse:
        if not self._api_key:
            raise ServiceUnavailableError("OpenAI API key is not configured")

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                _OPENAI_EMBEDDINGS_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "input": text,
                },
            )

        if response.status_code != 200:
            logger.error(
                "openai_embedding_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Embedding service failed")

        body = response.json()
        vector = body["data"][0]["embedding"]

        return EmbeddingResponse(
            vector=vector,
            provider=self.name,
            model=self._model,
        )

    async def embed_batch(
        self, *, texts: list[str]
    ) -> list[EmbeddingResponse]:
        if not self._api_key:
            raise ServiceUnavailableError("OpenAI API key is not configured")

        if not texts:
            return []

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                _OPENAI_EMBEDDINGS_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "input": texts,
                },
            )

        if response.status_code != 200:
            logger.error(
                "openai_embedding_batch_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Embedding service failed")

        body = response.json()
        # OpenAI returns embeddings in the same order as the input.
        results = [
            EmbeddingResponse(
                vector=item["embedding"],
                provider=self.name,
                model=self._model,
            )
            for item in sorted(body["data"], key=lambda d: d["index"])
        ]

        return results
