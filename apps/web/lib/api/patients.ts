"use client";

import type {
  AllergyResponse,
  ConditionResponse,
  CreatePatientRequest,
  MedicationResponse,
  PatientContactResponse,
  PatientResponse,
  PatientSummary,
  TimelineEventResponse,
  UpdatePatientRequest,
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

export async function listPatientsApi(): Promise<PatientSummary[]> {
  const accessToken = await getAccessToken();
  return api.get<PatientSummary[]>("/patients", { accessToken });
}

export async function searchPatientsApi(
  query: string,
  limit = 20,
): Promise<PatientSummary[]> {
  const accessToken = await getAccessToken();
  return api.get<PatientSummary[]>(
    `/patients/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { accessToken },
  );
}

export async function getPatientApi(
  patientId: string,
): Promise<PatientResponse> {
  const accessToken = await getAccessToken();
  return api.get<PatientResponse>(`/patients/${patientId}`, { accessToken });
}

export async function createPatientApi(
  data: CreatePatientRequest,
): Promise<PatientResponse> {
  const accessToken = await getAccessToken();
  return api.post<PatientResponse>("/patients", {
    accessToken,
    body: data,
  });
}

export async function updatePatientApi(
  patientId: string,
  data: UpdatePatientRequest,
): Promise<PatientResponse> {
  const accessToken = await getAccessToken();
  return api.patch<PatientResponse>(`/patients/${patientId}`, {
    accessToken,
    body: data,
  });
}

export async function deletePatientApi(patientId: string): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete(`/patients/${patientId}`, { accessToken });
}

export async function listConditionsApi(
  patientId: string,
): Promise<ConditionResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<ConditionResponse[]>(
    `/patients/${patientId}/conditions`,
    { accessToken },
  );
}

export async function addConditionApi(
  patientId: string,
  data: {
    name: string;
    status?: string;
    onset_date?: string | null;
    notes?: string | null;
  },
): Promise<ConditionResponse> {
  const accessToken = await getAccessToken();
  return api.post<ConditionResponse>(
    `/patients/${patientId}/conditions`,
    { accessToken, body: data },
  );
}

export async function removeConditionApi(
  patientId: string,
  conditionId: string,
): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete(`/patients/${patientId}/conditions/${conditionId}`, {
    accessToken,
  });
}

export async function listMedicationsApi(
  patientId: string,
): Promise<MedicationResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<MedicationResponse[]>(
    `/patients/${patientId}/medications`,
    { accessToken },
  );
}

export async function addMedicationApi(
  patientId: string,
  data: {
    name: string;
    dosage?: string | null;
    frequency?: string | null;
    status?: string;
    start_date?: string | null;
    notes?: string | null;
  },
): Promise<MedicationResponse> {
  const accessToken = await getAccessToken();
  return api.post<MedicationResponse>(
    `/patients/${patientId}/medications`,
    { accessToken, body: data },
  );
}

export async function removeMedicationApi(
  patientId: string,
  medicationId: string,
): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete(`/patients/${patientId}/medications/${medicationId}`, {
    accessToken,
  });
}

export async function listAllergiesApi(
  patientId: string,
): Promise<AllergyResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<AllergyResponse[]>(
    `/patients/${patientId}/allergies`,
    { accessToken },
  );
}

export async function addAllergyApi(
  patientId: string,
  data: {
    allergen: string;
    reaction?: string | null;
    severity?: string | null;
    notes?: string | null;
  },
): Promise<AllergyResponse> {
  const accessToken = await getAccessToken();
  return api.post<AllergyResponse>(
    `/patients/${patientId}/allergies`,
    { accessToken, body: data },
  );
}

export async function removeAllergyApi(
  patientId: string,
  allergyId: string,
): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete(`/patients/${patientId}/allergies/${allergyId}`, {
    accessToken,
  });
}

export async function listContactsApi(
  patientId: string,
): Promise<PatientContactResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<PatientContactResponse[]>(
    `/patients/${patientId}/contacts`,
    { accessToken },
  );
}

export async function listTimelineApi(
  patientId: string,
): Promise<TimelineEventResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<TimelineEventResponse[]>(
    `/patients/${patientId}/timeline`,
    { accessToken },
  );
}
