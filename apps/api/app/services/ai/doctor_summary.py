from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider
from app.schemas.clinical_extraction import ClinicalExtraction, VisitComparison

_SUMMARY_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Generate a concise doctor-facing \
summary from the current consultation extraction, visit comparison, and \
existing patient records.

CRITICAL SAFETY RULES (PRD §12):
1. Generate the summary ONLY from the provided verified/extracted information.
2. Never invent patient information, symptoms, medications, or dates.
3. If information is not available, state: "Not found in available patient \
records."
4. If you are uncertain about something, state: "Requires physician \
verification."
5. This summary is a DRAFT for physician review, not an official record.
6. Do not make autonomous medical decisions or prescribe medication.

The summary should include (where available):
- Patient demographics (from database, not LLM)
- Chief complaint
- Current symptoms with duration
- Previous visit date
- Relevant medical history
- Current medications
- Allergies
- Changes since previous visit
- Important information
- Uncertainties

Format the summary as a concise narrative with bullet points for key findings.

Respond ONLY with the JSON object. No other text.
"""

_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "Concise doctor-facing summary",
        },
        "source_references": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of record types that informed this summary",
        },
    },
    "required": ["summary", "source_references"],
}


class DoctorSummaryService:
    """Generates a doctor-facing summary from verified data.

    Combines:
    - Current consultation extraction
    - Visit comparison (previous vs current)
    - Existing patient records from Supabase

    The LLM is NOT the source of truth. Patient demographics, history,
    medications, and allergies come from the database. The LLM only
    synthesizes the provided information into a readable summary (PRD §8, §20).
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def generate(
        self,
        *,
        patient_context: str,
        current_extraction: ClinicalExtraction,
        comparison: VisitComparison,
    ) -> tuple[str, list[str]]:
        """Generate a doctor-facing summary.

        Returns (summary_text, source_references). The summary is always a
        draft for physician review (PRD §12).
        """
        import json

        extraction_json = json.dumps(
            current_extraction.model_dump(), indent=2, ensure_ascii=False
        )
        comparison_json = json.dumps(
            comparison.model_dump(), indent=2, ensure_ascii=False
        )

        user_prompt = (
            "Generate a concise doctor-facing summary from the following "
            "information. Only use the provided data.\n\n"
            f"Patient records from database:\n{patient_context}\n\n"
            f"Current consultation extraction:\n{extraction_json}\n\n"
            f"Visit comparison:\n{comparison_json}"
        )

        response = await self._llm.complete(
            system_prompt=_SUMMARY_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_SUMMARY_SCHEMA,
        )

        summary = response.content.get("summary", "")
        source_refs = response.content.get("source_references", [])

        return summary, source_refs
