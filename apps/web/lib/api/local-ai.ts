"use client";

import type {
  ComparisonResponse,
  DoctorSummaryResponse,
  ExtractResponse,
  NormalizeResponse,
  ProcessingStatusResponse,
  TranscriptResponse,
  UpdateEnglishTextRequest,
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

export async function getProcessingStatusApi(
  consultationId: string,
): Promise<ProcessingStatusResponse> {
  const accessToken = await getAccessToken();
  return api.get<ProcessingStatusResponse>(
    `/consultations/${consultationId}/processing-status`,
    { accessToken },
  );
}

export async function normalizeTranscriptApi(
  consultationId: string,
): Promise<NormalizeResponse> {
  const accessToken = await getAccessToken();
  return api.post<NormalizeResponse>(
    `/consultations/${consultationId}/normalize`,
    { accessToken },
  );
}

export async function extractClinicalInfoApi(
  consultationId: string,
): Promise<ExtractResponse> {
  const accessToken = await getAccessToken();
  return api.post<ExtractResponse>(
    `/consultations/${consultationId}/extract`,
    { accessToken },
  );
}

export async function compareVisitsAiApi(
  consultationId: string,
): Promise<ComparisonResponse> {
  const accessToken = await getAccessToken();
  return api.post<ComparisonResponse>(
    `/consultations/${consultationId}/compare`,
    { accessToken },
  );
}

export async function generateSummaryApi(
  consultationId: string,
): Promise<DoctorSummaryResponse> {
  const accessToken = await getAccessToken();
  return api.post<DoctorSummaryResponse>(
    `/consultations/${consultationId}/summary`,
    { accessToken },
  );
}

export async function getExtractionApi(
  consultationId: string,
): Promise<ExtractResponse | null> {
  const accessToken = await getAccessToken();
  try {
    return await api.get<ExtractResponse>(
      `/consultations/${consultationId}/extraction`,
      { accessToken },
    );
  } catch {
    return null;
  }
}

export async function getSummaryApi(
  consultationId: string,
): Promise<DoctorSummaryResponse | null> {
  const accessToken = await getAccessToken();
  try {
    return await api.get<DoctorSummaryResponse>(
      `/consultations/${consultationId}/summary`,
      { accessToken },
    );
  } catch {
    return null;
  }
}

export async function getTranscriptApi(
  consultationId: string,
): Promise<TranscriptResponse | null> {
  const accessToken = await getAccessToken();
  try {
    return await api.get<TranscriptResponse>(
      `/consultations/${consultationId}/transcript`,
      { accessToken },
    );
  } catch {
    return null;
  }
}

export async function updateEnglishTextApi(
  consultationId: string,
  data: UpdateEnglishTextRequest,
): Promise<TranscriptResponse> {
  const accessToken = await getAccessToken();
  return api.put<TranscriptResponse>(
    `/consultations/${consultationId}/transcript`,
    { body: data, accessToken },
  );
}
