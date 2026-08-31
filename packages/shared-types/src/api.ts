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
