from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.llm.base import LLMProvider, LLMResponse

logger = get_logger(__name__)


class OllamaLLMProvider(LLMProvider):
    """Ollama LLM provider for local development (PRD §11).

    Uses the Ollama native chat API with structured JSON output. Ollama
    supports JSON schema-constrained output via the ``format`` field, which
    ensures the response is valid JSON matching the caller's schema.

    The model is configurable via ``OLLAMA_MODEL`` (default: ``qwen3:8b``).
    Ollama runs locally on Apple Silicon with automatic Metal acceleration.
    """

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._model = settings.ollama_model
        self._timeout = settings.ollama_timeout_seconds

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
    ) -> LLMResponse:
        schema_instruction = (
            "\n\nYou must respond with ONLY a JSON object matching this "
            "schema. No markdown, no code fences, no explanation — just the "
            "JSON object.\n"
            f"{json.dumps(response_schema, indent=2)}"
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
                            "content": system_prompt + schema_instruction,
                        },
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                    "format": response_schema,
                    "options": {"temperature": 0.2},
                },
            )

        if response.status_code != 200:
            logger.error(
                "ollama_llm_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Ollama LLM service failed")

        body = response.json()
        content_str = body["message"]["content"]

        # Ollama with structured output should return clean JSON, but
        # some models wrap it in markdown fences. Strip those if present.
        content_str = content_str.strip()
        if content_str.startswith("```"):
            # Remove the opening fence (```json or ```) and closing fence.
            lines = content_str.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content_str = "\n".join(lines).strip()

        try:
            content = json.loads(content_str)
        except json.JSONDecodeError:
            logger.error("ollama_llm_invalid_json")
            raise ServiceUnavailableError("Ollama LLM returned invalid JSON") from None

        return LLMResponse(
            content=content,
            provider=self.name,
            model=self._model,
        )
