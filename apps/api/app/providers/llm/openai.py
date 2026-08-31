from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.llm.base import LLMProvider, LLMResponse

logger = get_logger(__name__)

_OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions"


class OpenAILLMProvider(LLMProvider):
    """OpenAI LLM provider with structured JSON output.

    Uses the OpenAI Chat Completions API with JSON mode to ensure
    structured output (PRD §11). The response is parsed as JSON and
    validated by the caller via Pydantic.
    """

    def __init__(self, settings: Settings) -> None:
        self._api_key = (
            settings.openai_api_key.get_secret_value()
            if settings.openai_api_key
            else None
        )
        self._model = settings.openai_llm_model

    @property
    def name(self) -> str:
        return "openai"

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
        if not self._api_key:
            raise ServiceUnavailableError("OpenAI API key is not configured")

        # Use JSON mode with a schema description in the system prompt.
        # OpenAI's structured outputs ensure the response is valid JSON.
        schema_instruction = (
            f"\n\nYou must respond with a JSON object matching this schema:\n"
            f"{json.dumps(response_schema, indent=2)}\n\n"
            f"Respond ONLY with the JSON object, no other text."
        )

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                _OPENAI_CHAT_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": system_prompt + schema_instruction},
                        {"role": "user", "content": user_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                },
            )

        if response.status_code != 200:
            logger.error(
                "openai_llm_failed",
                status=response.status_code,
                error_type="http_error",
            )
            raise ServiceUnavailableError("LLM service failed")

        body = response.json()
        content_str = body["choices"][0]["message"]["content"]

        try:
            content = json.loads(content_str)
        except json.JSONDecodeError:
            logger.error("openai_llm_invalid_json")
            raise ServiceUnavailableError("LLM returned invalid JSON") from None

        return LLMResponse(
            content=content,
            provider=self.name,
            model=self._model,
        )
