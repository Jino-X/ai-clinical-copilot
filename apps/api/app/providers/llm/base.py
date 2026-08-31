from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """The output of an LLM call with structured JSON output."""
    content: dict[str, Any]
    provider: str
    model: str


class LLMProvider(ABC):
    """Abstract interface for LLM providers (PRD §11).

    Implementations must use structured JSON output (PRD §11: "Use structured
    JSON/Pydantic schemas for AI outputs. Never rely on free-form LLM text
    for critical database operations").
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def model(self) -> str: ...

    @abstractmethod
    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
    ) -> LLMResponse: ...
