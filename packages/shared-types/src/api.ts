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
