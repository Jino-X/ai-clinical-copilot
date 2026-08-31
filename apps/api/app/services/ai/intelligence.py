from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider

# --- Patient Summary ---------------------------------------------------------

_SUMMARY_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Generate a concise patient summary
from the provided patient records. You assist the doctor but never replace
their judgment.

CRITICAL SAFETY RULES (PRD §12):
1. Never invent patient information, symptoms, medications, lab values,
   diagnoses, or dates. Only use information present in the records.
2. If information is not available, state: "Not found in available patient records."
3. If you are uncertain about something, state: "Requires physician verification."
4. Do not make autonomous medical decisions or prescribe medication.
5. This summary is a DRAFT for physician review, not an official record.

Generate a structured summary with:
- summary: A brief narrative overview of the patient's clinical status.
- key_conditions: List of active conditions.
- key_medications: List of current medications.
- key_allergies: List of known allergies.
- recent_activity: A brief description of recent clinical activity.
- source_references: List of record types and dates that informed this summary.
"""

_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "key_conditions": {"type": "array", "items": {"type": "string"}},
        "key_medications": {"type": "array", "items": {"type": "string"}},
        "key_allergies": {"type": "array", "items": {"type": "string"}},
        "recent_activity": {"type": "string"},
        "source_references": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "key_conditions", "key_medications", "key_allergies"],
}


# --- Visit Comparison --------------------------------------------------------

_COMPARISON_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Compare two consultation visits
and highlight clinically significant changes. You assist the doctor but never
replace their judgment.

CRITICAL SAFETY RULES (PRD §7, §12):
1. Never invent patient information or infer a change without supporting data.
2. Only report changes that are evident from the provided consultation records.
3. If a comparison cannot be made (e.g., missing data), state what is missing.
4. If uncertain, state: "Requires physician verification."
5. This comparison is a DRAFT for physician review.

Highlight these categories (PRD §7):
- new_symptoms: Symptoms present in the current visit but not the previous.
- changed_symptoms: Symptoms that have changed in character or severity.
- improved_symptoms: Symptoms that have improved.
- worsened_symptoms: Symptoms that have worsened.
- new_medications: Medications started since the previous visit.
- medication_changes: Dosage changes, discontinuations, or switches.
- important_changes: Any other clinically significant changes.
- narrative: A brief narrative summary of the comparison.
- source_references: Record references that informed this comparison.

If a category has no changes, return an empty array.
"""

_COMPARISON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "new_symptoms": {"type": "array", "items": {"type": "string"}},
        "changed_symptoms": {"type": "array", "items": {"type": "string"}},
        "improved_symptoms": {"type": "array", "items": {"type": "string"}},
        "worsened_symptoms": {"type": "array", "items": {"type": "string"}},
        "new_medications": {"type": "array", "items": {"type": "string"}},
        "medication_changes": {"type": "array", "items": {"type": "string"}},
        "important_changes": {"type": "array", "items": {"type": "string"}},
        "narrative": {"type": "string"},
        "source_references": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["narrative"],
}


# --- Patient History Q&A -----------------------------------------------------

_QA_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Answer the doctor's question about
a patient's history using only the provided patient records. You assist the
doctor but never replace their judgment.

CRITICAL SAFETY RULES (PRD §8, §12):
1. Answer ONLY from the provided patient records. Do not use general medical
   knowledge to fill in gaps.
2. Never invent patient information, symptoms, medications, lab values,
   diagnoses, or dates.
3. If the answer is not in the records, state: "Not found in available patient records."
4. If uncertain, state: "Requires physician verification."
5. Do not prescribe medication or make autonomous medical decisions.
6. Provide source references for every claim (record type and date).

Generate:
- answer: A clear, concise answer to the doctor's question.
- source_references: List of record types and dates that support the answer.
"""

_QA_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "source_references": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["answer"],
}


class IntelligenceService:
    """AI-powered patient intelligence: summary, comparison, and Q&A.

    All output is a draft for physician review (PRD §12). The LLM is
    instructed to never invent clinical data and to provide source references
    for every claim (PRD §8).
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def generate_summary(self, *, patient_context: str) -> dict[str, Any]:
        """Generate a patient summary from aggregated patient records."""
        user_prompt = (
            "Generate a patient summary from the following records.\n\n"
            f"Patient records:\n{patient_context}"
        )
        response = await self._llm.complete(
            system_prompt=_SUMMARY_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_SUMMARY_SCHEMA,
        )
        return response.content

    async def compare_visits(
        self, *, previous_context: str, current_context: str
    ) -> dict[str, Any]:
        """Compare two consultation visits and highlight changes (PRD §7)."""
        user_prompt = (
            "Compare the previous and current consultation visits. "
            "Highlight clinically significant changes.\n\n"
            f"Previous visit:\n{previous_context}\n\n"
            f"Current visit:\n{current_context}"
        )
        response = await self._llm.complete(
            system_prompt=_COMPARISON_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_COMPARISON_SCHEMA,
        )
        return response.content

    async def answer_question(
        self, *, patient_context: str, question: str
    ) -> dict[str, Any]:
        """Answer a doctor's question about patient history (PRD §8)."""
        user_prompt = (
            f"Answer the doctor's question using only the provided patient "
            f"records. Provide source references for every claim.\n\n"
            f"Patient records:\n{patient_context}\n\n"
            f"Doctor's question: {question}"
        )
        response = await self._llm.complete(
            system_prompt=_QA_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_QA_SCHEMA,
        )
        return response.content
