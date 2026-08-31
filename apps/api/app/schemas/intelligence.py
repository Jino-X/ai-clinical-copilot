from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PatientSummaryResponse(BaseModel):
    """AI-generated patient summary.

    Always a draft for physician review (PRD §12). Source references are
    included so the doctor can verify the summary against the records.
    """

    model_config = ConfigDict(from_attributes=True)

    summary: str
    key_conditions: list[str] = Field(default_factory=list)
    key_medications: list[str] = Field(default_factory=list)
    key_allergies: list[str] = Field(default_factory=list)
    recent_activity: str | None = None
    source_references: list[str] = Field(default_factory=list)
    provider: str
    model: str


class VisitComparisonRequest(BaseModel):
    """Request to compare two consultations."""
    model_config = ConfigDict(extra="forbid")

    previous_consultation_id: UUID
    current_consultation_id: UUID


class VisitComparisonResponse(BaseModel):
    """AI-generated comparison between two visits (PRD §7).

    Highlights new, changed, improved, and worsened symptoms, medication
    changes, and important historical changes. Never infers a change without
    supporting patient data (PRD §7).
    """

    model_config = ConfigDict(from_attributes=True)

    new_symptoms: list[str] = Field(default_factory=list)
    changed_symptoms: list[str] = Field(default_factory=list)
    improved_symptoms: list[str] = Field(default_factory=list)
    worsened_symptoms: list[str] = Field(default_factory=list)
    new_medications: list[str] = Field(default_factory=list)
    medication_changes: list[str] = Field(default_factory=list)
    important_changes: list[str] = Field(default_factory=list)
    narrative: str
    source_references: list[str] = Field(default_factory=list)
    provider: str
    model: str


class PatientQuestionRequest(BaseModel):
    """Doctor asks a question about the patient's history (PRD §8)."""
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2000)


class PatientQuestionResponse(BaseModel):
    """AI answer to a patient history question.

    The AI must answer only from authorized patient records and provide source
    references (PRD §8). If information is unavailable, it says so.
    """

    model_config = ConfigDict(from_attributes=True)

    answer: str
    source_references: list[str] = Field(default_factory=list)
    provider: str
    model: str
