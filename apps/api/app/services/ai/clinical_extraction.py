from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider
from app.schemas.clinical_extraction import ClinicalExtraction

_EXTRACTION_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Extract clinically relevant \
information from the following consultation transcript. The transcript has \
been translated to English from Tamil (or a Tamil-English mix).

CRITICAL SAFETY RULES (PRD §12):
1. Never invent patient information, symptoms, medications, lab values, \
diagnoses, or dates. Only extract information explicitly present in the \
transcript.
2. If a value is not mentioned in the transcript, use null (for single \
values) or [] (for lists). Do NOT guess.
3. If you are uncertain about something, add it to the "uncertainties" list.
4. Do not make medical decisions or prescribe medication.
5. Use clear, professional clinical language.
6. The "patient" object captures demographics AS MENTIONED in the transcript \
only. The backend retrieves authoritative patient data from the database \
separately.

Extract:
- patient: name, age, gender as mentioned in the conversation (null if not \
mentioned)
- chief_complaint: the main reason for the visit
- symptoms: list of symptoms with duration, severity, onset, status, trigger \
where available
- medical_conditions: conditions mentioned during the conversation
- medications_mentioned: medications discussed
- allergies_mentioned: allergies discussed
- tests_mentioned: lab tests or investigations mentioned
- doctor_observations: doctor's observable findings and observations
- treatments_mentioned: treatments discussed
- follow_up: follow-up instructions if any
- important_information: any other clinically relevant information
- uncertainties: anything you are not sure about

Respond ONLY with the JSON object. No other text.
"""

_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "patient": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "string"},
                "gender": {"type": "string"},
            },
        },
        "chief_complaint": {"type": "string"},
        "symptoms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "duration": {"type": "string"},
                    "severity": {"type": "string"},
                    "onset": {"type": "string"},
                    "status": {"type": "string"},
                    "trigger": {"type": "string"},
                },
                "required": ["name"],
            },
        },
        "medical_conditions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "medications_mentioned": {
            "type": "array",
            "items": {"type": "string"},
        },
        "allergies_mentioned": {
            "type": "array",
            "items": {"type": "string"},
        },
        "tests_mentioned": {
            "type": "array",
            "items": {"type": "string"},
        },
        "doctor_observations": {
            "type": "array",
            "items": {"type": "string"},
        },
        "treatments_mentioned": {
            "type": "array",
            "items": {"type": "string"},
        },
        "follow_up": {"type": "string"},
        "important_information": {
            "type": "array",
            "items": {"type": "string"},
        },
        "uncertainties": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "chief_complaint",
        "symptoms",
        "medical_conditions",
        "medications_mentioned",
        "allergies_mentioned",
        "tests_mentioned",
        "doctor_observations",
        "treatments_mentioned",
        "important_information",
        "uncertainties",
    ],
}


class ClinicalExtractionService:
    """Extracts structured clinical information from an English transcript.

    Uses the configured LLM (Ollama/Qwen3 for local dev) with structured JSON
    output. The LLM is NOT the source of truth — the backend combines the
    extraction with existing patient records from Supabase before generating
    the doctor-facing summary (PRD §8).
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def extract(self, *, english_transcript: str) -> ClinicalExtraction:
        """Extract clinical information from an English-normalized transcript.

        Returns a validated ClinicalExtraction. The LLM is instructed to
        never invent data — absent fields are null/empty (PRD §12).
        """
        user_prompt = (
            "Extract clinical information from the following consultation "
            "transcript. Only extract information explicitly present. "
            "Use null or [] for anything not mentioned.\n\n"
            f"Transcript:\n{english_transcript}"
        )

        response = await self._llm.complete(
            system_prompt=_EXTRACTION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_EXTRACTION_SCHEMA,
        )

        # Validate with Pydantic to ensure the schema is correct.
        return ClinicalExtraction.model_validate(response.content)
