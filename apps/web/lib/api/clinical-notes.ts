"use client";

import type {
  ClinicalNoteResponse,
  ClinicalNoteSummary,
  EditNoteRequest,
  SoapNoteResponse,
  TranscribeResponse,
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

export async function listClinicalNotesApi(): Promise<ClinicalNoteSummary[]> {
  const accessToken = await getAccessToken();
  return api.get<ClinicalNoteSummary[]>("/clinical-notes", { accessToken });
}

export async function getClinicalNoteApi(
  noteId: string,
): Promise<ClinicalNoteResponse> {
  const accessToken = await getAccessToken();
  return api.get<ClinicalNoteResponse>(`/clinical-notes/${noteId}`, {
    accessToken,
  });
}

export async function getNoteByConsultationApi(
  consultationId: string,
): Promise<ClinicalNoteResponse | null> {
  const accessToken = await getAccessToken();
  try {
    return await api.get<ClinicalNoteResponse>(
      `/clinical-notes/consultations/${consultationId}`,
      { accessToken },
    );
  } catch {
    return null;
  }
}

export async function listNoteVersionsApi(
  noteId: string,
): Promise<SoapNoteResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<SoapNoteResponse[]>(`/clinical-notes/${noteId}/versions`, {
    accessToken,
  });
}

export async function transcribeConsultationApi(
  consultationId: string,
  language?: string,
): Promise<TranscribeResponse> {
  const accessToken = await getAccessToken();
  return api.post<TranscribeResponse>(
    `/clinical-notes/consultations/${consultationId}/transcribe`,
    { accessToken, body: language ? { language } : {} },
  );
}

export async function generateSoapApi(
  consultationId: string,
): Promise<ClinicalNoteResponse> {
  const accessToken = await getAccessToken();
  return api.post<ClinicalNoteResponse>(
    `/clinical-notes/consultations/${consultationId}/generate-soap`,
    { accessToken },
  );
}

export async function editClinicalNoteApi(
  noteId: string,
  data: EditNoteRequest,
): Promise<ClinicalNoteResponse> {
  const accessToken = await getAccessToken();
  return api.patch<ClinicalNoteResponse>(`/clinical-notes/${noteId}`, {
    accessToken,
    body: data,
  });
}

export async function approveClinicalNoteApi(
  noteId: string,
  editNote?: string,
): Promise<ClinicalNoteResponse> {
  const accessToken = await getAccessToken();
  return api.post<ClinicalNoteResponse>(`/clinical-notes/${noteId}/approve`, {
    accessToken,
    body: editNote ? { edit_note: editNote } : {},
  });
}

export async function rejectClinicalNoteApi(
  noteId: string,
): Promise<ClinicalNoteResponse> {
  const accessToken = await getAccessToken();
  return api.post<ClinicalNoteResponse>(`/clinical-notes/${noteId}/reject`, {
    accessToken,
  });
}
