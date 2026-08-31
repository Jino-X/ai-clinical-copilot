from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConsultationStatus(StrEnum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ConsentType(StrEnum):
    AUDIO_RECORDING = "audio_recording"
    AI_PROCESSING = "ai_processing"


# --- Consultation ------------------------------------------------------------


class CreateConsultationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: UUID
    chief_complaint: str | None = Field(default=None, max_length=1000)


class UpdateConsultationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chief_complaint: str | None = Field(default=None, max_length=1000)
    doctor_summary: str | None = Field(default=None, max_length=10000)


class ConsultationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    patient_id: UUID
    doctor_id: UUID
    status: ConsultationStatus
    chief_complaint: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    audio_storage_path: str | None = None
    audio_content_type: str | None = None
    audio_size_bytes: int | None = None
    doctor_summary: str | None = None
    created_at: str
    updated_at: str


class ConsultationSummary(BaseModel):
    """Lightweight consultation record for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    doctor_id: UUID
    status: ConsultationStatus
    chief_complaint: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    created_at: str


# --- Consent -----------------------------------------------------------------


class GrantConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: UUID
    consultation_id: UUID | None = None
    consent_type: ConsentType
    notes: str | None = Field(default=None, max_length=2000)


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    patient_id: UUID
    consultation_id: UUID | None = None
    consent_type: ConsentType
    granted: bool
    recorded_by: UUID
    notes: str | None = None
    created_at: str


# --- Audio upload ------------------------------------------------------------


class CreateUploadUrlRequest(BaseModel):
    """Request a signed URL for uploading audio to private storage."""
    model_config = ConfigDict(extra="forbid")

    content_type: str = Field(
        default="audio/webm",
        description="MIME type of the audio file",
    )
    file_size_bytes: int = Field(gt=0, le=500 * 1024 * 1024)  # 500 MB max


class CreateUploadUrlResponse(BaseModel):
    """A signed URL the client uploads audio to directly.

    The client uploads to Supabase Storage via the signed URL; the backend
    never proxies the audio. The path is recorded on the consultation after
    upload completes.
    """

    upload_url: str
    storage_path: str
    expires_at: str


class ConfirmUploadRequest(BaseModel):
    """Confirm that an audio upload completed and record the path."""
    model_config = ConfigDict(extra="forbid")

    storage_path: str
    content_type: str
    file_size_bytes: int = Field(gt=0, le=500 * 1024 * 1024)


class AudioUrlResponse(BaseModel):
    """A signed URL for downloading audio. Time-limited for security."""

    download_url: str
    expires_at: str
    content_type: str | None = None
    size_bytes: int | None = None
