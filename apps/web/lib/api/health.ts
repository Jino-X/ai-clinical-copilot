import type { ReadinessResponse } from "@clinical-copilot/shared-types";

import { api } from "@/lib/api/client";

export const healthQuery = {
  queryKey: ["health"] as const,
  queryFn: () => api.get<ReadinessResponse>("/health/ready"),
};
