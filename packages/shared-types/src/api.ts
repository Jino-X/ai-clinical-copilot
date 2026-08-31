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
