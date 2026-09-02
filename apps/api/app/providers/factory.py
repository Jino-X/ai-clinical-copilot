from __future__ import annotations

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.embedding.base import EmbeddingProvider
from app.providers.embedding.ollama import OllamaEmbeddingProvider
from app.providers.embedding.openai import OpenAIEmbeddingProvider
from app.providers.llm.base import LLMProvider
from app.providers.llm.ollama import OllamaLLMProvider
from app.providers.llm.openai import OpenAILLMProvider
from app.providers.transcription.base import TranscriptionProvider
from app.providers.transcription.openai import OpenAITranscriptionProvider
from app.providers.translation.base import TranslationProvider
from app.providers.translation.local import LocalTranslationProvider

logger = get_logger(__name__)


class ProviderFactory:
    """Selects AI providers based on configuration (PRD §11).

    Provider selection is centralized here so adding a new provider is a
    one-file change. The factory is constructed once at startup and shared
    via app.state.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._llm: LLMProvider | None = None
        self._transcription: TranscriptionProvider | None = None
        self._embedding: EmbeddingProvider | None = None
        self._translation: TranslationProvider | None = None

    @property
    def llm(self) -> LLMProvider:
        if self._llm is not None:
            return self._llm

        provider_name = self._settings.llm_provider
        if provider_name is None:
            raise ServiceUnavailableError("LLM provider is not configured")

        if provider_name == "openai":
            self._llm = OpenAILLMProvider(self._settings)
        elif provider_name == "ollama":
            self._llm = OllamaLLMProvider(self._settings)
        else:
            raise ServiceUnavailableError(f"Unknown LLM provider: {provider_name}")

        logger.info("llm_provider_initialized", provider=provider_name)
        return self._llm

    @property
    def transcription(self) -> TranscriptionProvider:
        if self._transcription is not None:
            return self._transcription

        provider_name = self._settings.transcription_provider
        if provider_name is None:
            raise ServiceUnavailableError("Transcription provider is not configured")

        if provider_name == "openai":
            self._transcription = OpenAITranscriptionProvider(self._settings)
        elif provider_name == "indicconformer":
            from app.providers.transcription.indicconformer import (
                IndicConformerProvider,
            )

            self._transcription = IndicConformerProvider(self._settings)
        else:
            raise ServiceUnavailableError(
                f"Unknown transcription provider: {provider_name}"
            )

        logger.info("transcription_provider_initialized", provider=provider_name)
        return self._transcription

    @property
    def llm_configured(self) -> bool:
        return self._settings.llm_provider is not None

    @property
    def transcription_configured(self) -> bool:
        return self._settings.transcription_provider is not None

    @property
    def embedding(self) -> EmbeddingProvider:
        if self._embedding is not None:
            return self._embedding

        provider_name = self._settings.embedding_provider
        if provider_name is None:
            raise ServiceUnavailableError("Embedding provider is not configured")

        if provider_name == "openai":
            self._embedding = OpenAIEmbeddingProvider(self._settings)
        elif provider_name == "ollama":
            self._embedding = OllamaEmbeddingProvider(self._settings)
        else:
            raise ServiceUnavailableError(f"Unknown embedding provider: {provider_name}")

        logger.info("embedding_provider_initialized", provider=provider_name)
        return self._embedding

    @property
    def embedding_configured(self) -> bool:
        return self._settings.embedding_provider is not None

    @property
    def translation(self) -> TranslationProvider:
        if self._translation is not None:
            return self._translation

        provider_name = self._settings.translation_provider
        if provider_name is None:
            raise ServiceUnavailableError("Translation provider is not configured")

        if provider_name == "local":
            self._translation = LocalTranslationProvider(self._settings)
        else:
            raise ServiceUnavailableError(
                f"Unknown translation provider: {provider_name}"
            )

        logger.info("translation_provider_initialized", provider=provider_name)
        return self._translation

    @property
    def translation_configured(self) -> bool:
        return self._settings.translation_provider is not None
