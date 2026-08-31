from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.translation.base import TranslationProvider, TranslationResult

logger = get_logger(__name__)

_TRANSLATION_SYSTEM_PROMPT = """\
You are a medical translation assistant. Translate the following text to \
English. The text may be in Tamil, English, or a mix of both (code-switching).

CRITICAL RULES:
1. Preserve ALL medical terminology and clinical details.
2. Do NOT summarize, omit, or add information.
3. Preserve the original meaning exactly.
4. Keep English medical terms in English (e.g., "chest pain", "blood pressure").
5. Translate Tamil colloquialisms to their English clinical equivalents.
6. If a word or phrase is ambiguous, translate it to the most clinically \
appropriate English term.
7. Output ONLY the translated English text. No explanations, no notes.

Example input: "Doctor, எனக்கு மூன்று வாரமா chest pain இருக்கு. \
Walking பண்ணும்போது அதிகமாகுது."
Example output: "Doctor, I have had chest pain for three weeks. \
It gets worse when walking."
"""

_TRANSLATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "translated_text": {
            "type": "string",
            "description": "The English translation of the input text",
        },
    },
    "required": ["translated_text"],
}


class LocalTranslationProvider(TranslationProvider):
    """Local translation provider using the configured LLM (Ollama/Qwen3).

    This is the most practical local approach for Tamil → English translation
    on the development machine. It uses the same LLM that powers clinical
    extraction, avoiding the need for a separate translation model.

    The architecture allows a paid translation API (e.g., Google Translate,
    Azure Translator) to replace this implementation later by adding a new
    TranslationProvider subclass.
    """

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._model = settings.ollama_model
        self._timeout = settings.ollama_timeout_seconds

    @property
    def name(self) -> str:
        return "local"

    @property
    def model(self) -> str:
        return self._model

    async def translate_to_english(
        self,
        *,
        text: str,
        source_language: str | None = None,
    ) -> TranslationResult:
        if not text.strip():
            return TranslationResult(
                full_text="",
                provider=self.name,
                model=self.model,
                source_language=source_language,
            )

        user_prompt = (
            f"Translate the following text to English. "
            f"Preserve all medical details.\n\nText:\n{text}"
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/api/chat",
                headers={"Content-Type": "application/json"},
                json={
                    "model": self._model,
                    "messages": [
                        {
                            "role": "system",
                            "content": _TRANSLATION_SYSTEM_PROMPT,
                        },
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                    "format": _TRANSLATION_SCHEMA,
                    "options": {"temperature": 0.1},
                },
            )

        if response.status_code != 200:
            logger.error(
                "local_translation_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Translation service failed")

        body = response.json()
        content_str = body["message"]["content"]

        # Strip markdown fences if present.
        content_str = content_str.strip()
        if content_str.startswith("```"):
            lines = content_str.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content_str = "\n".join(lines).strip()

        try:
            content = json.loads(content_str)
            translated = content.get("translated_text", "")
        except json.JSONDecodeError:
            # If JSON parsing fails, use the raw text as the translation.
            # This is a fallback — the model should return structured JSON.
            logger.warning("local_translation_invalid_json_using_raw")
            translated = content_str

        return TranslationResult(
            full_text=translated,
            provider=self.name,
            model=self._model,
            source_language=source_language,
        )
