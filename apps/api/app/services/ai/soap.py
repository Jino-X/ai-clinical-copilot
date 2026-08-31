from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider

# The system prompt enforces AI safety rules (PRD §12):
# - Never invent patient information
# - Use "Not found in available patient records." for absent information
# - Use "Requires physician verification." for uncertain information
# - Assessment and Plan are drafts requiring doctor confirmation
_SOAP_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Your job is to generate a SOAP note
draft from a consultation transcript. You assist the doctor but never replace
their judgment.

CRITICAL SAFETY RULES:
1. Never invent patient information, symptoms, medications, lab values,
   diagnoses, or dates. Only use information present in the transcript.
2. If information is not available in the transcript, write:
   "Not found in available patient records."
3. If you are uncertain about something, write:
   "Requires physician verification."
4. The Assessment and Plan sections are DRAFTS that require doctor
   confirmation before becoming part of the official clinical record.
5. Do not prescribe medication or make autonomous medical decisions.
6. Use clear, professional clinical language.

Generate a SOAP note with these sections:
- subjective: Patient's complaints, symptoms, and history as reported.
- objective: Observable findings, vital signs, examination results.
- assessment: Clinical assessment and differential diagnosis (DRAFT).
- plan: Treatment plan, medications, referrals, follow-up (DRAFT).
- follow_up: Follow-up instructions and timeline.

If a section has no relevant information in the transcript, use
"Not found in available patient records." for that section.
"""

_SOAP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subjective": {
            "type": "string",
            "description": "Patient-reported symptoms and complaints",
        },
        "objective": {
            "type": "string",
            "description": "Objective findings and examination results",
        },
        "assessment": {
            "type": "string",
            "description": "Clinical assessment (DRAFT)",
        },
        "plan": {
            "type": "string",
            "description": "Treatment plan (DRAFT)",
        },
        "follow_up": {
            "type": "string",
            "description": "Follow-up instructions",
        },
    },
    "required": ["subjective", "objective", "assessment", "plan", "follow_up"],
}


class SoapGenerationService:
    """Generates a SOAP note draft from a transcript using an LLM.

    The output is always a draft (PRD §5, §12). Assessment and Plan are
    explicitly marked as requiring doctor confirmation. The LLM is instructed
    to never invent clinical data.
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def generate(self, *, transcript_text: str) -> dict[str, str | None]:
        """Generate a SOAP note draft from a transcript.

        Returns a dict with keys: subjective, objective, assessment, plan,
        follow_up. Each value is a string or None.
        """
        user_prompt = (
            "Generate a SOAP note from the following consultation transcript. "
            "Only use information present in the transcript. "
            "If information is not available, use "
            '"Not found in available patient records." '
            "for that section.\n\n"
            f"Transcript:\n{transcript_text}"
        )

        response = await self._llm.complete(
            system_prompt=_SOAP_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_SOAP_SCHEMA,
        )

        content = response.content
        return {
            "subjective": content.get("subjective"),
            "objective": content.get("objective"),
            "assessment": content.get("assessment"),
            "plan": content.get("plan"),
            "follow_up": content.get("follow_up"),
        }
