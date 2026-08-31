from __future__ import annotations

from typing import Any

from app.providers.llm.base import LLMProvider

# --- Classification + Medical Extraction -------------------------------------

# The system prompt enforces AI safety rules (PRD §12):
# - Never invent patient information
# - Use "Not found in available patient records." for absent information
# - Use "Requires physician verification." for uncertain information
# - Extracted data is a draft requiring doctor verification
_EXTRACTION_SYSTEM_PROMPT = """\
You are a clinical documentation assistant. Your job is to classify a medical
document and extract structured medical information from its text. You assist
the doctor but never replace their judgment.

CRITICAL SAFETY RULES (PRD §12):
1. Never invent patient information, symptoms, medications, lab values,
   diagnoses, or dates. Only use information present in the document text.
2. If information is not available in the text, use:
   "Not found in available patient records."
3. If you are uncertain about something, use:
   "Requires physician verification."
4. The extracted information is a DRAFT requiring doctor verification before
   it becomes part of the official patient record.
5. Do not make autonomous medical decisions or prescribe medication.

Classify the document into one of these categories:
- lab_report: Laboratory test results
- imaging_report: Radiology or imaging reports
- prescription: Medication prescriptions
- referral_letter: Referral letters between providers
- discharge_summary: Hospital discharge summaries
- clinical_note: Clinical notes or progress notes
- insurance_document: Insurance or billing documents
- identification: Patient identification documents
- other: Does not fit any category above

Extract structured medical information:
- document_type: A brief description of the document type.
- date: The date on the document, if present.
- summary: A brief summary of the document content.
- key_findings: Important findings (lab values, diagnoses, etc.).
- medications: Medications mentioned in the document.
- conditions: Medical conditions mentioned.
- follow_up: Follow-up instructions, if any.
- source_references: References to the document sections that informed the
  extraction.
"""

_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": [
                "lab_report",
                "imaging_report",
                "prescription",
                "referral_letter",
                "discharge_summary",
                "clinical_note",
                "insurance_document",
                "identification",
                "other",
            ],
        },
        "document_type": {"type": "string"},
        "date": {"type": "string"},
        "summary": {"type": "string"},
        "key_findings": {"type": "array", "items": {"type": "string"}},
        "medications": {"type": "array", "items": {"type": "string"}},
        "conditions": {"type": "array", "items": {"type": "string"}},
        "follow_up": {"type": "string"},
        "source_references": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["category", "summary"],
}


class DocumentExtractionService:
    """Classifies and extracts medical information from document text.

    The output is always a draft for physician review (PRD §9, §12). The LLM
    is instructed to never invent clinical data.
    """

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def extract(self, *, document_text: str) -> dict[str, Any]:
        """Classify and extract medical information from document text.

        Returns a dict with: category, document_type, date, summary,
        key_findings, medications, conditions, follow_up, source_references.
        """
        user_prompt = (
            "Classify and extract medical information from the following "
            "document text. Only use information present in the text.\n\n"
            f"Document text:\n{document_text}"
        )

        response = await self._llm.complete(
            system_prompt=_EXTRACTION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_schema=_EXTRACTION_SCHEMA,
        )

        return response.content
