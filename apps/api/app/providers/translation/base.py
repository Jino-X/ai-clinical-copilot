from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TranslationResult:
    """The output of a translation call."""

    full_text: str
    provider: str
    model: str
    source_language: str | None = None
    target_language: str = "en"


class TranslationProvider(ABC):
    """Abstract interface for translation providers.

    Translates a transcript to English while preserving medical terminology
    and clinical detail. The original transcript is never modified (PRD §4).
    The architecture allows a paid translation API to replace the local
    implementation later.
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def model(self) -> str: ...

    @abstractmethod
    async def translate_to_english(
        self,
        *,
        text: str,
        source_language: str | None = None,
    ) -> TranslationResult: ...
