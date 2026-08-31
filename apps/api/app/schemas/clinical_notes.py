from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NoteStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class NoteVersionSource(StrEnum):
    AI_GENERATED = "ai_generated"
    DOCTOR_EDITED = "doctor_edited"
    DOCTOR_APPROVED = "doctor_approved"


# --- SOAP note content -------------------------------------------------------


class SoapNoteContent(BaseModel):
    """The structured content of a SOAP note (PRD §5).

    Assessment and Plan are AI-generated drafts requiring doctor confirmation
    (PRD §5). The entire note is a draft until approved.
    """

    model_config = ConfigDict(extra="forbid")

    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    follow_up: str | None = None


class SoapNoteResponse(SoapNoteContent):
    """SOAP note content with version metadata."""
    model_config = ConfigDict(from_attributes=True)

    version: int
    source: NoteVersionSource
    authored_by: UUID
    edit_note: str | None = None
    created_at: str


# --- Clinical note -----------------------------------------------------------


class ClinicalNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    consultation_id: UUID
    patient_id: UUID
    status: NoteStatus
    current_version: int
    approved_by: UUID | None = None
    approved_at: str | None = None
    created_at: str
    updated_at: str
    # The current version's content, included for convenience.
    latest_version: SoapNoteResponse | None = None


class ClinicalNoteSummary(BaseModel):
    """Lightweight note record for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    consultation_id: UUID
    patient_id: UUID
    status: NoteStatus
    current_version: int
    created_at: str


class EditNoteRequest(BaseModel):
    """Doctor edits the SOAP note. Creates a new version (PRD §23)."""
    model_config = ConfigDict(extra="forbid")

    subjective: str | None = Field(default=None, max_length=10000)
    objective: str | None = Field(default=None, max_length=10000)
    assessment: str | None = Field(default=None, max_length=10000)
    plan: str | None = Field(default=None, max_length=10000)
    follow_up: str | None = Field(default=None, max_length=10000)
    edit_note: str | None = Field(default=None, max_length=500)


class ApproveNoteRequest(BaseModel):
    """Doctor approves the note. Creates a final version (PRD §23)."""
    model_config = ConfigDict(extra="forbid")

    edit_note: str | None = Field(default=None, max_length=500)


# --- AI generation -----------------------------------------------------------


class GenerateSoapRequest(BaseModel):
    """Request to generate a SOAP note from a transcript."""
    model_config = ConfigDict(extra="forbid")

    # Optional: if not provided, uses the consultation's transcript.


class AiGenerationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_type: str
    provider: str
    model: str | None = None
    status: str
    error_message: str | None = None
    duration_ms: int | None = None
    created_at: str


# --- Transcription -----------------------------------------------------------


class TranscribeRequest(BaseModel):
    """Request to transcribe the consultation's audio."""
    model_config = ConfigDict(extra="forbid")

    language: str | None = Field(default=None, max_length=10)


class TranscribeResponse(BaseModel):
    """The result of a transcription request."""
    transcript_id: UUID
    full_text: str
    provider: str
    model: str
    language: str | None = None
    duration_seconds: int | None = None
