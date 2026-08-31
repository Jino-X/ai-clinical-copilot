"use client";

import type {
  RagIndexResponse,
  RagIndexStatusResponse,
  RagQuestionResponse,
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

export async function indexPatientApi(
  patientId: string,
): Promise<RagIndexResponse> {
  const accessToken = await getAccessToken();
  return api.post<RagIndexResponse>(`/rag/patients/${patientId}/index`, {
    accessToken,
  });
}

export async function getIndexStatusApi(
  patientId: string,
): Promise<RagIndexStatusResponse> {
  const accessToken = await getAccessToken();
  return api.get<RagIndexStatusResponse>(
    `/rag/patients/${patientId}/index-status`,
    { accessToken },
  );
}

export async function askWithRagApi(
  patientId: string,
  question: string,
): Promise<RagQuestionResponse> {
  const accessToken = await getAccessToken();
  return api.post<RagQuestionResponse>(`/rag/patients/${patientId}/ask`, {
    accessToken,
    body: { question },
  });
}
