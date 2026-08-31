"use client";

import type {
  AudioUrlResponse,
  ConsentResponse,
  ConsultationResponse,
  ConsultationStatus,
  ConsultationSummary,
  CreateConsultationRequest,
  CreateUploadUrlResponse,
  GrantConsentRequest,
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

export async function listConsultationsApi(
  status?: ConsultationStatus,
): Promise<ConsultationSummary[]> {
  const accessToken = await getAccessToken();
  const query = status ? `?status=${status}` : "";
  return api.get<ConsultationSummary[]>(`/consultations${query}`, {
    accessToken,
  });
}

export async function getConsultationApi(
  consultationId: string,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.get<ConsultationResponse>(`/consultations/${consultationId}`, {
    accessToken,
  });
}

export async function createConsultationApi(
  data: CreateConsultationRequest,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsultationResponse>("/consultations", {
    accessToken,
    body: data,
  });
}

export async function startConsultationApi(
  consultationId: string,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsultationResponse>(
    `/consultations/${consultationId}/start`,
    { accessToken },
  );
}

export async function completeConsultationApi(
  consultationId: string,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsultationResponse>(
    `/consultations/${consultationId}/complete`,
    { accessToken },
  );
}

export async function cancelConsultationApi(
  consultationId: string,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsultationResponse>(
    `/consultations/${consultationId}/cancel`,
    { accessToken },
  );
}

export async function updateConsultationApi(
  consultationId: string,
  data: { chief_complaint?: string | null; doctor_summary?: string | null },
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.patch<ConsultationResponse>(`/consultations/${consultationId}`, {
    accessToken,
    body: data,
  });
}

export async function listConsentsApi(
  consultationId: string,
): Promise<ConsentResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<ConsentResponse[]>(
    `/consultations/${consultationId}/consents`,
    { accessToken },
  );
}

export async function grantConsentApi(
  consultationId: string,
  data: GrantConsentRequest,
): Promise<ConsentResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsentResponse>(
    `/consultations/${consultationId}/consents/grant`,
    { accessToken, body: data },
  );
}

export async function revokeConsentApi(
  consultationId: string,
  data: GrantConsentRequest,
): Promise<ConsentResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsentResponse>(
    `/consultations/${consultationId}/consents/revoke`,
    { accessToken, body: data },
  );
}

export async function createUploadUrlApi(
  consultationId: string,
  contentType: string,
  fileSizeBytes: number,
): Promise<CreateUploadUrlResponse> {
  const accessToken = await getAccessToken();
  return api.post<CreateUploadUrlResponse>(
    `/consultations/${consultationId}/audio/upload-url`,
    {
      accessToken,
      body: {
        content_type: contentType,
        file_size_bytes: fileSizeBytes,
      },
    },
  );
}

export async function confirmAudioUploadApi(
  consultationId: string,
  storagePath: string,
  contentType: string,
  fileSizeBytes: number,
): Promise<ConsultationResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConsultationResponse>(
    `/consultations/${consultationId}/audio/confirm`,
    {
      accessToken,
      body: {
        storage_path: storagePath,
        content_type: contentType,
        file_size_bytes: fileSizeBytes,
      },
    },
  );
}

export async function getAudioDownloadUrlApi(
  consultationId: string,
): Promise<AudioUrlResponse> {
  const accessToken = await getAccessToken();
  return api.get<AudioUrlResponse>(
    `/consultations/${consultationId}/audio/download-url`,
    { accessToken },
  );
}
