"use client";

import type {
  PatientQuestionResponse,
  PatientSummaryResponse,
  VisitComparisonResponse,
} from "@clinical-copilot/shared-types";

import { api } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

export async function generatePatientSummaryApi(
  patientId: string,
): Promise<PatientSummaryResponse> {
  const accessToken = await getAccessToken();
  return api.post<PatientSummaryResponse>(
    `/intelligence/patients/${patientId}/summary`,
    { accessToken },
  );
}

export async function compareVisitsApi(
  patientId: string,
  previousConsultationId: string,
  currentConsultationId: string,
): Promise<VisitComparisonResponse> {
  const accessToken = await getAccessToken();
  return api.post<VisitComparisonResponse>(
    `/intelligence/patients/${patientId}/compare-visits`,
    {
      accessToken,
      body: {
        previous_consultation_id: previousConsultationId,
        current_consultation_id: currentConsultationId,
      },
    },
  );
}

export async function askPatientQuestionApi(
  patientId: string,
  question: string,
): Promise<PatientQuestionResponse> {
  const accessToken = await getAccessToken();
  return api.post<PatientQuestionResponse>(
    `/intelligence/patients/${patientId}/ask`,
    { accessToken, body: { question } },
  );
}
