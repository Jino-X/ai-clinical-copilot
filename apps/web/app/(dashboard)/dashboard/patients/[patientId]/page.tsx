"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Calendar, Stethoscope } from "lucide-react";
import type { TimelineEventType } from "@clinical-copilot/shared-types";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PatientIntelligence } from "@/components/patient-intelligence";
import { PatientDocuments } from "@/components/patient-documents";
import { ApiError } from "@/lib/api/client";
import {
  addAllergyApi,
  addConditionApi,
  addMedicationApi,
  getPatientApi,
  listAllergiesApi,
  listConditionsApi,
  listMedicationsApi,
  listPatientConsultationsApi,
  listTimelineApi,
  removeAllergyApi,
  removeConditionApi,
  removeMedicationApi,
} from "@/lib/api/patients";

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  resolved: "secondary",
  chronic: "destructive",
  recurrence: "destructive",
  completed: "secondary",
  discontinued: "secondary",
  on_hold: "outline",
};

const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  consultation: "Consultation",
  diagnosis: "Diagnosis",
  medication: "Medication",
  lab_report: "Lab Report",
  document: "Document",
  procedure: "Procedure",
  follow_up: "Follow-up",
  allergy: "Allergy",
  condition: "Condition",
};

export default function PatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [startingConsultation, setStartingConsultation] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patients", patientId],
    queryFn: () => getPatientApi(patientId),
  });

  const { data: conditions = [] } = useQuery({
    queryKey: ["patients", patientId, "conditions"],
    queryFn: () => listConditionsApi(patientId),
  });

  const { data: medications = [] } = useQuery({
    queryKey: ["patients", patientId, "medications"],
    queryFn: () => listMedicationsApi(patientId),
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["patients", patientId, "allergies"],
    queryFn: () => listAllergiesApi(patientId),
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ["patients", patientId, "timeline"],
    queryFn: () => listTimelineApi(patientId),
  });

  const { data: consultations = [] } = useQuery({
    queryKey: ["patients", patientId, "consultations"],
    queryFn: () => listPatientConsultationsApi(patientId),
  });

  // --- Mutations ---

  const conditionMutation = useMutation({
    mutationFn: (data: {
      name: string;
      status?: string;
      onset_date?: string | null;
    }) => addConditionApi(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "conditions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "timeline"],
      });
      toast.success("Condition added");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const medicationMutation = useMutation({
    mutationFn: (data: {
      name: string;
      dosage?: string | null;
      status?: string;
    }) => addMedicationApi(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "medications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "timeline"],
      });
      toast.success("Medication added");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const allergyMutation = useMutation({
    mutationFn: (data: {
      allergen: string;
      reaction?: string | null;
      severity?: string | null;
    }) => addAllergyApi(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "allergies"],
      });
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "timeline"],
      });
      toast.success("Allergy added");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const removeConditionMutation = useMutation({
    mutationFn: (id: string) => removeConditionApi(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "conditions"],
      });
      toast.success("Condition removed");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const removeMedicationMutation = useMutation({
    mutationFn: (id: string) => removeMedicationApi(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "medications"],
      });
      toast.success("Medication removed");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const removeAllergyMutation = useMutation({
    mutationFn: (id: string) => removeAllergyApi(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patients", patientId, "allergies"],
      });
      toast.success("Allergy removed");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  if (isLoading || !patient) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-muted-foreground">Loading patient…</p>
      </div>
    );
  }

  const startConsultation = () => {
    setStartingConsultation(true);
    import("@/lib/api/consultations")
      .then(({ createConsultationApi }) =>
        createConsultationApi({ patient_id: patientId }),
      )
      .then((consultation) => {
        toast.success("Consultation created");
        router.push(`/dashboard/consultations/${consultation.id}`);
      })
      .catch((e) => {
        toast.error(
          e instanceof ApiError ? e.message : "Something went wrong",
        );
      })
      .finally(() => setStartingConsultation(false));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {patient.first_name} {patient.last_name}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {patient.date_of_birth && <span>DOB: {patient.date_of_birth}</span>}
            <span className="capitalize">· {patient.sex}</span>
            {patient.phone && <span>· {patient.phone}</span>}
            {patient.email && <span>· {patient.email}</span>}
          </div>
        </div>
        <Button onClick={startConsultation} disabled={startingConsultation}>
          <Stethoscope className="size-4" aria-hidden />
          {startingConsultation ? "Starting…" : "Start consultation"}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="conditions">
            Conditions ({conditions.length})
          </TabsTrigger>
          <TabsTrigger value="medications">
            Medications ({medications.length})
          </TabsTrigger>
          <TabsTrigger value="allergies">
            Allergies ({allergies.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">
            Timeline ({timeline.length})
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Demographics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Date of birth" value={patient.date_of_birth} />
              <InfoRow label="Sex" value={patient.sex} capitalize />
              <InfoRow label="Phone" value={patient.phone} />
              <InfoRow label="Email" value={patient.email} />
              <InfoRow label="Address" value={patient.address} />
              <InfoRow
                label="Emergency contact"
                value={
                  patient.emergency_contact_name
                    ? `${patient.emergency_contact_name}${
                        patient.emergency_contact_phone
                          ? ` (${patient.emergency_contact_phone})`
                          : ""
                      }`
                    : null
                }
              />
            </CardContent>
          </Card>

          {patient.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{patient.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Conditions */}
        <TabsContent value="conditions" className="space-y-4">
          <AddItemForm
            title="Add condition"
            placeholder="Condition name"
            fields={[
              {
                name: "status",
                label: "Status",
                type: "select",
                options: ["active", "resolved", "chronic", "recurrence"],
              },
              { name: "onset_date", label: "Onset date", type: "date" },
            ]}
            onSubmit={(data) =>
              startTransition(() =>
                conditionMutation.mutate({
                  name: data.name ?? "",
                  status: data.status ?? undefined,
                  onset_date: data.onset_date || null,
                }),
              )
            }
            pending={conditionMutation.isPending}
          />
          <Card>
            <CardContent className="space-y-1 pt-6">
              {conditions.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No conditions recorded.
                </p>
              ) : (
                conditions.map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between py-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{c.name}</p>
                        <div className="flex gap-2">
                          <Badge
                            variant={
                              (STATUS_COLORS[c.status] as "default") ?? "outline"
                            }
                            className="capitalize"
                          >
                            {c.status}
                          </Badge>
                          {c.onset_date && (
                            <span className="text-xs text-muted-foreground">
                              Onset: {c.onset_date}
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <p className="text-xs text-muted-foreground">
                            {c.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          startTransition(() =>
                            removeConditionMutation.mutate(c.id),
                          )
                        }
                        aria-label={`Remove ${c.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Medications */}
        <TabsContent value="medications" className="space-y-4">
          <AddItemForm
            title="Add medication"
            placeholder="Medication name"
            fields={[
              { name: "dosage", label: "Dosage", type: "text" },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: ["active", "completed", "discontinued", "on_hold"],
              },
            ]}
            onSubmit={(data) =>
              startTransition(() =>
                medicationMutation.mutate({
                  name: data.name ?? "",
                  dosage: data.dosage || null,
                  status: data.status ?? undefined,
                }),
              )
            }
            pending={medicationMutation.isPending}
          />
          <Card>
            <CardContent className="space-y-1 pt-6">
              {medications.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No medications recorded.
                </p>
              ) : (
                medications.map((m, i) => (
                  <div key={m.id}>
                    {i > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between py-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{m.name}</p>
                        <div className="flex gap-2">
                          {m.dosage && (
                            <span className="text-xs text-muted-foreground">
                              {m.dosage}
                            </span>
                          )}
                          <Badge
                            variant={
                              (STATUS_COLORS[m.status] as "default") ?? "outline"
                            }
                            className="capitalize"
                          >
                            {m.status.replace("_", " ")}
                          </Badge>
                        </div>
                        {m.notes && (
                          <p className="text-xs text-muted-foreground">
                            {m.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          startTransition(() =>
                            removeMedicationMutation.mutate(m.id),
                          )
                        }
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Allergies */}
        <TabsContent value="allergies" className="space-y-4">
          <AddItemForm
            title="Add allergy"
            placeholder="Allergen"
            nameField="allergen"
            fields={[
              { name: "reaction", label: "Reaction", type: "text" },
              {
                name: "severity",
                label: "Severity",
                type: "select",
                options: ["mild", "moderate", "severe"],
              },
            ]}
            onSubmit={(data) =>
              startTransition(() =>
                allergyMutation.mutate({
                  allergen: data.allergen ?? "",
                  reaction: data.reaction || null,
                  severity: data.severity || null,
                }),
              )
            }
            pending={allergyMutation.isPending}
          />
          <Card>
            <CardContent className="space-y-1 pt-6">
              {allergies.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No allergies recorded.
                </p>
              ) : (
                allergies.map((a, i) => (
                  <div key={a.id}>
                    {i > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between py-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{a.allergen}</p>
                        <div className="flex gap-2">
                          {a.reaction && (
                            <span className="text-xs text-muted-foreground">
                              Reaction: {a.reaction}
                            </span>
                          )}
                          {a.severity && (
                            <Badge
                              variant={
                                a.severity === "severe"
                                  ? "destructive"
                                  : "outline"
                              }
                              className="capitalize"
                            >
                              {a.severity}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          startTransition(() =>
                            removeAllergyMutation.mutate(a.id),
                          )
                        }
                        aria-label={`Remove ${a.allergen}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient timeline</CardTitle>
              <CardDescription>
                Chronological history of clinically significant events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeline.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No timeline events yet.
                </p>
              ) : (
                timeline.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-3 rounded-md border p-3"
                  >
                    <Calendar
                      className="size-4 mt-0.5 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{event.title}</p>
                        <Badge variant="outline" className="text-xs">
                          {EVENT_TYPE_LABELS[event.event_type]}
                        </Badge>
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {event.event_date}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-4">
          <PatientDocuments patientId={patientId} />
        </TabsContent>

        {/* Intelligence */}
        <TabsContent value="intelligence" className="space-y-4">
          <PatientIntelligence
            patientId={patientId}
            consultationIds={consultations.map((c) => c.id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string | null | undefined;
  capitalize?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${capitalize ? "capitalize" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

type AddItemField = {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  options?: string[];
};

function AddItemForm({
  title,
  placeholder,
  nameField = "name",
  fields = [],
  onSubmit,
  pending,
}: {
  title: string;
  placeholder: string;
  nameField?: string;
  fields?: AddItemField[];
  onSubmit: (data: Record<string, string | null>) => void;
  pending: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, string | null> = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value as string;
    }
    onSubmit(data);
    formRef.current?.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="size-4" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={nameField}>{placeholder}</Label>
            <Input id={nameField} name={nameField} type="text" required />
          </div>
          {fields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "select" ? (
                    <select
                      id={field.name}
                      name={field.name}
                      className="flex h-8 w-full rounded-lg border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
