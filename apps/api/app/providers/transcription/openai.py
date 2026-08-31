from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
)

logger = get_logger(__name__)

_OPENAI_AUDIO_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"


class OpenAITranscriptionProvider(TranscriptionProvider):
    """OpenAI Whisper transcription provider.

    Uses the OpenAI Audio API. The API key is read from settings and never
    exposed to the frontend.
    """

    def __init__(self, settings: Settings) -> None:
        self._api_key = (
            settings.openai_api_key.get_secret_value()
            if settings.openai_api_key
            else None
        )
        self._model = settings.openai_transcription_model

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    async def transcribe(
        self,
        *,
        audio_data: bytes,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult:
        if not self._api_key:
            raise ServiceUnavailableError("OpenAI API key is not configured")

        # Map content type to file extension for the multipart form.
        ext = "webm"
        if "ogg" in content_type:
            ext = "ogg"
        elif "mp4" in content_type or "m4a" in content_type:
            ext = "m4a"
        elif "wav" in content_type:
            ext = "wav"
        elif "mp3" in content_type:
            ext = "mp3"

        # Build multipart form as a dict. The value type matches httpx's
        # expected tuple shape for file uploads.
        files: dict[str, tuple[str | None, bytes | str, str | None]] = {
            "file": (f"audio.{ext}", audio_data, content_type),
            "model": (None, self._model, None),
            "response_format": (None, "json", None),
        }
        if language:
            files["language"] = (None, language, None)

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                _OPENAI_AUDIO_ENDPOINT,
                headers={"Authorization": f"Bearer {self._api_key}"},
                files=files,
            )

        if response.status_code != 200:
            logger.error(
                "openai_transcription_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Transcription service failed")

        body = response.json()
        return TranscriptionResult(
            full_text=body.get("text", ""),
            provider=self.name,
            model=self._model,
            language=body.get("language") or language,
            duration_seconds=body.get("duration"),
        )
