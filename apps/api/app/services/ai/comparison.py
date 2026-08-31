from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider
from app.schemas.clinical_extraction import (
    ChangeType,
    ClinicalExtraction,
    VisitChange,
    VisitComparison,
)

_COMPARISON_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Compare the current consultation \
findings with the patient's previous records. Identify clinically significant \
changes.

CRITICAL SAFETY RULES (PRD §12):
1. Only report changes that are supported by the available records.
2. Do NOT invent previous or current findings.
3. If there is no previous data for an item, mark the change as "new".
4. If you cannot determine whether something changed, mark it as "unknown".
5. Use clear, professional clinical language.

Change types:
- new: This item was not present in previous records.
- improved: This item has gotten better since the previous visit.
- worsened: This item has gotten worse since the previous visit.
- unchanged: This item is the same as in previous records.
- resolved: This item was present previously but is no longer reported.
- unknown: Cannot determine the change from available data.

Respond ONLY with the JSON object. No other text.
"""

_COMPARISON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string"},
                    "previous": {"type": "string"},
                    "current": {"type": "string"},
                    "change": {
                        "type": "string",
                        "enum": [
                            "new",
                            "improved",
                            "worsened",
                            "unchanged",
                            "resolved",
                            "unknown",
                        ],
                    },
                },
                "required": ["item", "change"],
            },
        },
    },
    "required": ["changes"],
}


class VisitComparisonService:
    """Compares current consultation findings with previous patient records.

    Identifies new, improved, worsened, unchanged, resolved, and unknown
    changes. Only reports changes supported by available records (PRD §12).
    The LLM receives both the current extraction and the patient's previous
    records as context — it does not access the database directly (PRD §20).
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def compare(
        self,
        *,
        current_extraction: ClinicalExtraction,
        previous_context: str,
    ) -> VisitComparison:
        """Compare current extraction with previous patient context.

        The previous_context is built by the backend from Supabase records
        (conditions, medications, allergies, previous consultations). The LLM
        never accesses the database directly (PRD §20).
        """
        import json

        current_json = json.dumps(
            current_extraction.model_dump(), indent=2, ensure_ascii=False
        )

        user_prompt = (
            "Compare the current consultation findings with the patient's "
            "previous records. Only report changes supported by the data.\n\n"
            f"Previous patient records:\n{previous_context}\n\n"
            f"Current consultation extraction:\n{current_json}"
        )

        response = await self._llm.complete(
            system_prompt=_COMPARISON_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_COMPARISON_SCHEMA,
        )

        changes_data = response.content.get("changes", [])
        changes: list[VisitChange] = []
        for c in changes_data:
            try:
                changes.append(
                    VisitChange(
                        item=c.get("item", ""),
                        previous=c.get("previous"),
                        current=c.get("current"),
                        change=ChangeType(c.get("change", "unknown")),
                    )
                )
            except (ValueError, KeyError):
                # Skip malformed entries rather than failing the whole call.
                continue

        return VisitComparison(changes=changes)
