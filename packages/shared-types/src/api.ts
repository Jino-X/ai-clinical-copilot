/** Error envelope produced by `app/core/errors.py`. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
  };
};

export type CheckStatus = "ok" | "error" | "skipped";

export type CheckResult = {
  status: CheckStatus;
  detail?: string | null;
};

/** Response of `GET /health/ready`. */
export type ReadinessResponse = {
  status: "ok" | "degraded";
  service: string;
  version: string;
  environment: string;
  checks: Record<string, CheckResult>;
};

/** Response of `GET /health/live`. */
export type LivenessResponse = {
  status: "ok";
};

// --- Phase 2: Auth & Organizations -------------------------------------------

/** Mirrors `OrganizationRole` in `apps/api/app/core/permissions.py`. */
export type OrganizationRole = "staff" | "nurse" | "doctor" | "admin" | "owner";

/** Mirrors `Permission` in `apps/api/app/core/permissions.py`. */
export type Permission =
  | "organization:update"
  | "organization:delete"
  | "member:read"
  | "member:invite"
  | "member:update_role"
  | "member:remove"
  | "audit:read"
  | "patient:read"
  | "patient:write"
  | "consultation:conduct"
  | "clinical_note:approve";

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  active_organization_id: string | null;
};

export type MembershipSummary = {
  organization_id: string;
  organization_name: string;
  role: OrganizationRole;
  status: string;
};

/** Response of `GET /auth/me`. */
export type CurrentUserResponse = {
  profile: UserProfile;
  memberships: MembershipSummary[];
  active_organization_id: string | null;
  permissions: Permission[];
};

export type OrganizationResponse = {
  id: string;
  name: string;
  created_at: string;
  role: OrganizationRole | null;
};

export type MemberResponse = {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  role: OrganizationRole;
  status: string;
  created_at: string;
};

// --- Phase 3: Patients -------------------------------------------------------

export type Sex = "male" | "female" | "other" | "unknown";

export type ConditionStatus = "active" | "resolved" | "chronic" | "recurrence";

export type MedicationStatus =
  | "active"
  | "completed"
  | "discontinued"
  | "on_hold";

export type AllergySeverity = "mild" | "moderate" | "severe";

export type TimelineEventType =
  | "consultation"
  | "diagnosis"
  | "medication"
  | "lab_report"
  | "document"
  | "procedure"
  | "follow_up"
  | "allergy"
  | "condition";

export type PatientSummary = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: Sex;
  phone: string | null;
  email: string | null;
};

export type PatientResponse = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: Sex;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatePatientRequest = {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  sex?: Sex;
  national_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
};

export type UpdatePatientRequest = Partial<CreatePatientRequest>;

export type PatientContactResponse = {
  id: string;
  patient_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type ConditionResponse = {
  id: string;
  patient_id: string;
  name: string;
  status: ConditionStatus;
  onset_date: string | null;
  resolved_date: string | null;
  notes: string | null;
  created_at: string;
};

export type MedicationResponse = {
  id: string;
  patient_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  status: MedicationStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

export type AllergyResponse = {
  id: string;
  patient_id: string;
  allergen: string;
  reaction: string | null;
  severity: AllergySeverity | null;
  notes: string | null;
  created_at: string;
};

export type TimelineEventResponse = {
  id: string;
  patient_id: string;
  event_type: TimelineEventType;
  event_date: string;
  title: string;
  description: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
};

// --- Phase 4: Consultations --------------------------------------------------

export type ConsultationStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ConsentType = "audio_recording" | "ai_processing";

export type ConsultationSummary = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: ConsultationStatus;
  chief_complaint: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type ConsultationResponse = {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  status: ConsultationStatus;
  chief_complaint: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  audio_storage_path: string | null;
  audio_content_type: string | null;
  audio_size_bytes: number | null;
  doctor_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateConsultationRequest = {
  patient_id: string;
  chief_complaint?: string | null;
};

export type ConsentResponse = {
  id: string;
  organization_id: string;
  patient_id: string;
  consultation_id: string | null;
  consent_type: ConsentType;
  granted: boolean;
  recorded_by: string;
  notes: string | null;
  created_at: string;
};

export type GrantConsentRequest = {
  patient_id: string;
  consultation_id?: string | null;
  consent_type: ConsentType;
  notes?: string | null;
};

export type CreateUploadUrlResponse = {
  upload_url: string;
  storage_path: string;
  expires_at: string;
};

export type AudioUrlResponse = {
  download_url: string;
  expires_at: string;
  content_type: string | null;
  size_bytes: number | null;
};

// --- Phase 5: Clinical notes and AI documentation ---------------------------

export type NoteStatus = "draft" | "in_review" | "approved" | "rejected";

export type NoteVersionSource =
  | "ai_generated"
  | "doctor_edited"
  | "doctor_approved";

export type SoapNoteContent = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  follow_up: string | null;
};

export type SoapNoteResponse = SoapNoteContent & {
  version: number;
  source: NoteVersionSource;
  authored_by: string;
  edit_note: string | null;
  created_at: string;
};

export type ClinicalNoteResponse = {
  id: string;
  consultation_id: string;
  patient_id: string;
  status: NoteStatus;
  current_version: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  latest_version: SoapNoteResponse | null;
};

export type ClinicalNoteSummary = {
  id: string;
  consultation_id: string;
  patient_id: string;
  status: NoteStatus;
  current_version: number;
  created_at: string;
};

export type EditNoteRequest = {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  follow_up?: string | null;
  edit_note?: string | null;
};

export type TranscribeResponse = {
  transcript_id: string;
  full_text: string;
  provider: string;
  model: string;
  language: string | null;
  duration_seconds: number | null;
};

// --- Phase 6: Patient Intelligence -------------------------------------------

export type PatientSummaryResponse = {
  summary: string;
  key_conditions: string[];
  key_medications: string[];
  key_allergies: string[];
  recent_activity: string | null;
  source_references: string[];
  provider: string;
  model: string;
};

export type VisitComparisonResponse = {
  new_symptoms: string[];
  changed_symptoms: string[];
  improved_symptoms: string[];
  worsened_symptoms: string[];
  new_medications: string[];
  medication_changes: string[];
  important_changes: string[];
  narrative: string;
  source_references: string[];
  provider: string;
  model: string;
};

export type PatientQuestionResponse = {
  answer: string;
  source_references: string[];
  provider: string;
  model: string;
};

// --- Phase 7: Documents ------------------------------------------------------

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "verified"
  | "failed";

export type DocumentCategory =
  | "lab_report"
  | "imaging_report"
  | "prescription"
  | "referral_letter"
  | "discharge_summary"
  | "clinical_note"
  | "insurance_document"
  | "identification"
  | "other";

export type MedicalDocumentResponse = {
  id: string;
  organization_id: string;
  patient_id: string;
  uploaded_by: string;
  title: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number;
  status: DocumentStatus;
  category: DocumentCategory | null;
  extracted_text: string | null;
  extracted_data: Record<string, unknown> | null;
  extraction_provider: string | null;
  extraction_model: string | null;
  verified_by: string | null;
  verified_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalDocumentSummary = {
  id: string;
  patient_id: string;
  title: string;
  file_name: string;
  content_type: string;
  status: DocumentStatus;
  category: DocumentCategory | null;
  verified_at: string | null;
  created_at: string;
};

export type CreateDocumentUploadUrlResponse = {
  upload_url: string;
  storage_path: string;
  document_id: string;
  expires_at: string;
};

export type DocumentDownloadUrlResponse = {
  download_url: string;
  expires_at: string;
  content_type: string | null;
  size_bytes: number | null;
};
