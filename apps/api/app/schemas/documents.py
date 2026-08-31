from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    EXTRACTED = "extracted"
    VERIFIED = "verified"
    FAILED = "failed"


class DocumentCategory(StrEnum):
    LAB_REPORT = "lab_report"
    IMAGING_REPORT = "imaging_report"
    PRESCRIPTION = "prescription"
    REFERRAL_LETTER = "referral_letter"
    DISCHARGE_SUMMARY = "discharge_summary"
    CLINICAL_NOTE = "clinical_note"
    INSURANCE_DOCUMENT = "insurance_document"
    IDENTIFICATION = "identification"
    OTHER = "other"


# --- Upload ------------------------------------------------------------------


class CreateUploadUrlRequest(BaseModel):
    """Request a signed URL for uploading a document."""

    model_config = ConfigDict(extra="forbid")

    patient_id: UUID
    title: str = Field(min_length=1, max_length=200)
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)
    file_size_bytes: int = Field(gt=0, le=100 * 1024 * 1024)  # 100 MB max


class CreateUploadUrlResponse(BaseModel):
    """A signed URL for uploading a document to private storage."""

    upload_url: str
    storage_path: str
    document_id: UUID
    expires_at: str


# --- Document responses ------------------------------------------------------


class MedicalDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    patient_id: UUID
    uploaded_by: UUID
    title: str
    storage_path: str
    file_name: str
    content_type: str
    file_size_bytes: int
    status: DocumentStatus
    category: DocumentCategory | None = None
    extracted_text: str | None = None
    extracted_data: dict | None = None
    extraction_provider: str | None = None
    extraction_model: str | None = None
    verified_by: UUID | None = None
    verified_at: str | None = None
    error_message: str | None = None
    created_at: str
    updated_at: str


class MedicalDocumentSummary(BaseModel):
    """Lightweight document record for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    title: str
    file_name: str
    content_type: str
    status: DocumentStatus
    category: DocumentCategory | None = None
    verified_at: str | None = None
    created_at: str


# --- Verification ------------------------------------------------------------


class VerifyDocumentRequest(BaseModel):
    """Doctor verifies the extracted information (PRD §9)."""

    model_config = ConfigDict(extra="forbid")

    category: DocumentCategory | None = None
    # The doctor can edit the extracted data before verifying.
    extracted_data: dict | None = None


class UpdateDocumentRequest(BaseModel):
    """Update document metadata."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: DocumentCategory | None = None


# --- Download URL ------------------------------------------------------------


class DocumentDownloadUrlResponse(BaseModel):
    download_url: str
    expires_at: str
    content_type: str | None = None
    size_bytes: int | None = None
