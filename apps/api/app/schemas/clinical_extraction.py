from __future__ import annotations

from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# --- Clinical extraction (Phase: Local AI) -----------------------------------


class Symptom(BaseModel):
    """A single symptom extracted from the consultation."""

    model_config = ConfigDict(extra="forbid")

    name: str
    duration: str | None = None
    severity: str | None = None
    onset: str | None = None
    status: str | None = None
    trigger: str | None = None


class PatientInfo(BaseModel):
    """Patient demographics as mentioned in the transcript.

    These fields are extracted from the conversation only. The backend
    retrieves authoritative patient data from Supabase — the LLM does not
    reconstruct it (PRD §8).
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    age: str | None = None
    gender: str | None = None


class ClinicalExtraction(BaseModel):
    """Structured clinical extraction from a consultation transcript.

    Every field defaults to None or [] — the LLM must never guess. If a
    value is not present in the transcript, it remains null/empty (PRD §12).
    """

    model_config = ConfigDict(extra="forbid")

    patient: PatientInfo = Field(default_factory=PatientInfo)
    chief_complaint: str | None = None
    symptoms: list[Symptom] = Field(default_factory=list)
    medical_conditions: list[str] = Field(default_factory=list)
    medications_mentioned: list[str] = Field(default_factory=list)
    allergies_mentioned: list[str] = Field(default_factory=list)
    tests_mentioned: list[str] = Field(default_factory=list)
    doctor_observations: list[str] = Field(default_factory=list)
    treatments_mentioned: list[str] = Field(default_factory=list)
    follow_up: str | None = None
    important_information: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)


# JSON schema dict for the LLM prompt (used by LLMProvider.complete).
CLINICAL_EXTRACTION_SCHEMA: dict[str, Any] = {
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


# --- Visit comparison --------------------------------------------------------


class ChangeType(StrEnum):
    NEW = "new"
    IMPROVED = "improved"
    WORSENED = "worsened"
    UNCHANGED = "unchanged"
    RESOLVED = "resolved"
    UNKNOWN = "unknown"


class VisitChange(BaseModel):
    """A single change between previous and current visit."""

    model_config = ConfigDict(extra="forbid")

    item: str
    previous: str | None = None
    current: str | None = None
    change: ChangeType


class VisitComparison(BaseModel):
    """Comparison of previous vs current consultation findings."""

    model_config = ConfigDict(extra="forbid")

    changes: list[VisitChange] = Field(default_factory=list)


# --- Doctor-facing summary ---------------------------------------------------


class DoctorSummary(BaseModel):
    """Concise doctor-facing summary generated from verified data."""

    model_config = ConfigDict(extra="forbid")

    summary: str
    source_references: list[str] = Field(default_factory=list)


# --- API request/response schemas --------------------------------------------


class NormalizeResponse(BaseModel):
    """Result of English normalization."""

    model_config = ConfigDict(from_attributes=True)

    transcript_id: UUID
    english_text: str
    provider: str
    model: str
    source_language: str | None = None


class ExtractResponse(BaseModel):
    """Result of clinical extraction."""

    model_config = ConfigDict(from_attributes=True)

    extraction_id: UUID
    extraction: ClinicalExtraction
    provider: str
    model: str


class ComparisonResponse(BaseModel):
    """Result of visit comparison."""

    model_config = ConfigDict(from_attributes=True)

    comparison: VisitComparison
    provider: str
    model: str


class DoctorSummaryResponse(BaseModel):
    """Result of doctor-facing summary generation."""

    model_config = ConfigDict(from_attributes=True)

    summary: str
    source_references: list[str] = Field(default_factory=list)
    provider: str
    model: str


class ProcessingStage(StrEnum):
    """Processing stages for the consultation AI pipeline."""

    IDLE = "idle"
    TRANSCRIBING = "transcribing"
    NORMALIZING = "normalizing"
    EXTRACTING = "extracting"
    SUMMARIZING = "summarizing"
    READY = "ready"
    FAILED = "failed"


class ProcessingStatusResponse(BaseModel):
    """Current processing status of a consultation's AI pipeline."""

    model_config = ConfigDict(from_attributes=True)

    stage: ProcessingStage
    has_transcript: bool = False
    has_english_transcript: bool = False
    has_extraction: bool = False
    has_summary: bool = False
    error_message: str | None = None
