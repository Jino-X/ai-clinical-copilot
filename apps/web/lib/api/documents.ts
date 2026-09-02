"use client";

import type {
  CreateDocumentUploadUrlResponse,
  DocumentCategory,
  DocumentDownloadUrlResponse,
  MedicalDocumentResponse,
  MedicalDocumentSummary,
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

export async function listDocumentsApi(
  patientId?: string,
): Promise<MedicalDocumentSummary[]> {
  const accessToken = await getAccessToken();
  const query = patientId ? `?patient_id=${patientId}` : "";
  return api.get<MedicalDocumentSummary[]>(`/documents${query}`, {
    accessToken,
  });
}

export async function getDocumentApi(
  documentId: string,
): Promise<MedicalDocumentResponse> {
  const accessToken = await getAccessToken();
  return api.get<MedicalDocumentResponse>(`/documents/${documentId}`, {
    accessToken,
  });
}

export async function createUploadUrlApi(
  patientId: string,
  title: string,
  fileName: string,
  contentType: string,
  fileSizeBytes: number,
): Promise<CreateDocumentUploadUrlResponse> {
  const accessToken = await getAccessToken();
  return api.post<CreateDocumentUploadUrlResponse>(`/documents/upload-url`, {
    accessToken,
    body: {
      patient_id: patientId,
      title,
      file_name: fileName,
      content_type: contentType,
      file_size_bytes: fileSizeBytes,
    },
  });
}

export async function getDocumentDownloadUrlApi(
  documentId: string,
): Promise<DocumentDownloadUrlResponse> {
  const accessToken = await getAccessToken();
  return api.get<DocumentDownloadUrlResponse>(
    `/documents/${documentId}/download-url`,
    { accessToken },
  );
}

export async function extractDocumentApi(
  documentId: string,
): Promise<MedicalDocumentResponse> {
  const accessToken = await getAccessToken();
  return api.post<MedicalDocumentResponse>(
    `/documents/${documentId}/extract`,
    { accessToken },
  );
}

export async function updateDocumentApi(
  documentId: string,
  data: { title?: string; category?: DocumentCategory },
): Promise<MedicalDocumentResponse> {
  const accessToken = await getAccessToken();
  return api.patch<MedicalDocumentResponse>(`/documents/${documentId}`, {
    accessToken,
    body: data,
  });
}

export async function verifyDocumentApi(
  documentId: string,
  data: { category?: DocumentCategory; extracted_data?: Record<string, unknown> },
): Promise<MedicalDocumentResponse> {
  const accessToken = await getAccessToken();
  return api.post<MedicalDocumentResponse>(
    `/documents/${documentId}/verify`,
    { accessToken, body: data },
  );
}

export async function deleteDocumentApi(
  documentId: string,
): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete<void>(`/documents/${documentId}`, { accessToken });
}
