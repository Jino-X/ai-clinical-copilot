from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    """The output of a transcription call."""

    full_text: str
    provider: str
    model: str
    language: str | None = None
    duration_seconds: int | None = None


class TranscriptionProvider(ABC):
    """Abstract interface for speech-to-text providers (PRD §11).

    Implementations must not invent text. If the audio is unintelligible,
    return an empty or partial transcript — never a fabricated one.
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def model(self) -> str: ...

    @abstractmethod
    async def transcribe(
        self,
        *,
        audio_data: bytes,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult: ...
