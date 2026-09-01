from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Sex(StrEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class ConditionStatus(StrEnum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    CHRONIC = "chronic"
    RECURRENCE = "recurrence"


class MedicationStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    DISCONTINUED = "discontinued"
    ON_HOLD = "on_hold"


class AllergySeverity(StrEnum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class TimelineEventType(StrEnum):
    CONSULTATION = "consultation"
    DIAGNOSIS = "diagnosis"
    MEDICATION = "medication"
    LAB_REPORT = "lab_report"
    DOCUMENT = "document"
    PROCEDURE = "procedure"
    FOLLOW_UP = "follow_up"
    ALLERGY = "allergy"
    CONDITION = "condition"


# --- Patient -----------------------------------------------------------------


class PatientBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(min_length=1, max_length=200)
    last_name: str = Field(min_length=1, max_length=200)
    date_of_birth: date | None = None
    sex: Sex = Sex.UNKNOWN
    national_id: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, max_length=200)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=200)
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=5000)


class CreatePatientRequest(PatientBase):
    pass


class UpdatePatientRequest(BaseModel):
    """Partial update — all fields optional, omitted fields are untouched."""

    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=200)
    last_name: str | None = Field(default=None, min_length=1, max_length=200)
    date_of_birth: date | None = None
    sex: Sex | None = None
    national_id: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, max_length=200)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=200)
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=5000)


class PatientResponse(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime


class PatientSummary(BaseModel):
    """A lightweight patient record for list/search results."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    date_of_birth: date | None = None
    sex: Sex
    phone: str | None = None
    email: EmailStr | None = None


# --- Patient contacts --------------------------------------------------------


class PatientContactBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    relationship: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CreatePatientContactRequest(PatientContactBase):
    pass


class PatientContactResponse(PatientContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID


# --- Conditions --------------------------------------------------------------


class ConditionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    status: ConditionStatus = ConditionStatus.ACTIVE
    onset_date: date | None = None
    resolved_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)


class CreateConditionRequest(ConditionBase):
    pass


class ConditionResponse(ConditionBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    created_at: str


# --- Medications -------------------------------------------------------------


class MedicationBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    dosage: str | None = Field(default=None, max_length=200)
    frequency: str | None = Field(default=None, max_length=200)
    route: str | None = Field(default=None, max_length=100)
    status: MedicationStatus = MedicationStatus.ACTIVE
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)


class CreateMedicationRequest(MedicationBase):
    pass


class MedicationResponse(MedicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    created_at: str


# --- Allergies ---------------------------------------------------------------


class AllergyBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allergen: str = Field(min_length=1, max_length=200)
    reaction: str | None = Field(default=None, max_length=500)
    severity: AllergySeverity | None = None
    notes: str | None = Field(default=None, max_length=5000)


class CreateAllergyRequest(AllergyBase):
    pass


class AllergyResponse(AllergyBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    created_at: str


# --- Timeline ----------------------------------------------------------------


class TimelineEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    event_type: TimelineEventType
    event_date: date
    title: str
    description: str | None = None
    source_type: str | None = None
    source_id: UUID | None = None
    created_at: str
