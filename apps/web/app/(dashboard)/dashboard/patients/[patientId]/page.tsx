"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Plus,
  Activity,
  Pill,
  AlertCircle,
  Stethoscope,
  FileText,
  Brain,
  ClipboardList,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PatientAvatar } from "@/components/clinical";
import { PatientIntelligence } from "@/components/patient-intelligence";
import { PatientDocuments } from "@/components/patient-documents";
import { PatientTimelineEnhanced } from "@/components/patient-timeline-enhanced";
import { ApiError } from "@/lib/api/client";
import { staggerContainer, staggerItem } from "@/lib/animations";
import {
  addAllergyApi,
  addConditionApi,
  addMedicationApi,
  deletePatientApi,
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

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  resolved: "secondary",
  chronic: "destructive",
  recurrence: "destructive",
  completed: "secondary",
  discontinued: "secondary",
  on_hold: "outline",
  mild: "secondary",
  moderate: "default",
  severe: "destructive",
};

export default function PatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [startingConsultation, setStartingConsultation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

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

  const deletePatientMutation = useMutation({
    mutationFn: () => deletePatientApi(patientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients", "list"] });
      toast.success("Patient deleted");
      router.push("/dashboard/patients");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete patient"),
  });

  if (isLoading || !patient) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
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

  const age = patient.date_of_birth
    ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Enhanced Patient Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-background via-background to-muted/30 shadow-sm"
      >
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-info/5 blur-3xl" />

        <div className="relative flex items-start justify-between gap-6 p-6">
          <div className="flex items-start gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              <PatientAvatar
                firstName={patient.first_name}
                lastName={patient.last_name}
                sex={patient.sex}
                size="lg"
                className="ring-4 ring-background shadow-md"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-2"
            >
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {patient.first_name} {patient.last_name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {age !== null && (
                    <span className="rounded-md bg-muted/60 px-2 py-0.5 text-xs">
                      {age} years
                    </span>
                  )}
                  <span className="rounded-md bg-muted/60 px-2 py-0.5 text-xs capitalize">
                    {patient.sex}
                  </span>
                  {patient.phone && (
                    <span className="text-xs">· {patient.phone}</span>
                  )}
                  {patient.email && (
                    <span className="text-xs">· {patient.email}</span>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex gap-3 pt-1">
                <QuickStat
                  icon={Activity}
                  label="Conditions"
                  value={conditions.length}
                  color="text-purple-600 bg-purple-500/10"
                />
                <QuickStat
                  icon={Pill}
                  label="Medications"
                  value={medications.length}
                  color="text-green-600 bg-green-500/10"
                />
                <QuickStat
                  icon={AlertCircle}
                  label="Allergies"
                  value={allergies.length}
                  color="text-yellow-600 bg-yellow-500/10"
                />
                <QuickStat
                  icon={Stethoscope}
                  label="Visits"
                  value={consultations.length}
                  color="text-blue-600 bg-blue-500/10"
                />
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col gap-2"
          >
            <Button
              onClick={startConsultation}
              disabled={startingConsultation}
              size="lg"
              className="shadow-md hover:shadow-lg transition-shadow"
            >
              <Stethoscope className="size-4" aria-hidden />
              {startingConsultation ? "Starting…" : "Consult"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Enhanced Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <ClipboardList className="size-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="conditions" className="gap-1.5">
              <Activity className="size-3.5" />
              Conditions ({conditions.length})
            </TabsTrigger>
            <TabsTrigger value="medications" className="gap-1.5">
              <Pill className="size-3.5" />
              Medications ({medications.length})
            </TabsTrigger>
            <TabsTrigger value="allergies" className="gap-1.5">
              <AlertCircle className="size-3.5" />
              Allergies ({allergies.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5">
              <Clock className="size-3.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="size-3.5" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="gap-1.5">
              <Brain className="size-3.5" />
              Intelligence
            </TabsTrigger>
          </TabsList>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Overview */}
          {activeTab === "overview" && (
            <TabsContent key="overview" value="overview" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Card className="overflow-hidden">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="size-5 text-primary" />
                      Demographics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
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

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryMiniCard
                    icon={Activity}
                    title="Conditions"
                    count={conditions.length}
                    items={conditions.slice(0, 3).map((c) => c.name)}
                    onMore={() => setActiveTab("conditions")}
                    color="purple"
                  />
                  <SummaryMiniCard
                    icon={Pill}
                    title="Medications"
                    count={medications.length}
                    items={medications.slice(0, 3).map((m) => m.name)}
                    onMore={() => setActiveTab("medications")}
                    color="green"
                  />
                  <SummaryMiniCard
                    icon={AlertCircle}
                    title="Allergies"
                    count={allergies.length}
                    items={allergies.slice(0, 3).map((a) => a.allergen)}
                    onMore={() => setActiveTab("allergies")}
                    color="yellow"
                  />
                </div>
              </motion.div>
            </TabsContent>
          )}

          {/* Conditions */}
          {activeTab === "conditions" && (
            <TabsContent key="conditions" value="conditions" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
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
                <MedicalList
                  items={conditions.map((c) => ({
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    notes: c.notes,
                    dateLabel: c.onset_date ? `Onset: ${c.onset_date}` : undefined,
                  }))}
                  emptyMessage="No conditions recorded."
                  onRemove={(id) =>
                    startTransition(() => removeConditionMutation.mutate(id))
                  }
                  removePending={removeConditionMutation.isPending}
                />
              </motion.div>
            </TabsContent>
          )}

          {/* Medications */}
          {activeTab === "medications" && (
            <TabsContent key="medications" value="medications" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
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
                <MedicalList
                  items={medications.map((m) => ({
                    id: m.id,
                    name: m.name,
                    status: m.status,
                    notes: m.notes,
                    extra: m.dosage,
                  }))}
                  emptyMessage="No medications recorded."
                  onRemove={(id) =>
                    startTransition(() => removeMedicationMutation.mutate(id))
                  }
                  removePending={removeMedicationMutation.isPending}
                />
              </motion.div>
            </TabsContent>
          )}

          {/* Allergies */}
          {activeTab === "allergies" && (
            <TabsContent key="allergies" value="allergies" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
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
                <MedicalList
                  items={allergies.map((a) => ({
                    id: a.id,
                    name: a.allergen,
                    status: a.severity ?? undefined,
                    notes: undefined,
                    extra: a.reaction ? `Reaction: ${a.reaction}` : undefined,
                  }))}
                  emptyMessage="No allergies recorded."
                  onRemove={(id) =>
                    startTransition(() => removeAllergyMutation.mutate(id))
                  }
                  removePending={removeAllergyMutation.isPending}
                />
              </motion.div>
            </TabsContent>
          )}

          {/* Timeline */}
          {activeTab === "timeline" && (
            <TabsContent key="timeline" value="timeline" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <PatientTimelineEnhanced events={timeline} />
              </motion.div>
            </TabsContent>
          )}

          {/* Documents */}
          {activeTab === "documents" && (
            <TabsContent key="documents" value="documents" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <PatientDocuments patientId={patientId} />
              </motion.div>
            </TabsContent>
          )}

          {/* Intelligence */}
          {activeTab === "intelligence" && (
            <TabsContent key="intelligence" value="intelligence" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <PatientIntelligence
                  patientId={patientId}
                  consultationIds={consultations.map((c) => c.id)}
                />
              </motion.div>
            </TabsContent>
          )}
        </AnimatePresence>
      </Tabs>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete patient?"
        description={`This will soft-delete ${patient.first_name} ${patient.last_name} and hide all their records from all views. The data is preserved in the database but no longer accessible. This action cannot be undone from the UI.`}
        confirmLabel="Delete patient"
        destructive
        pending={deletePatientMutation.isPending}
        onConfirm={() => deletePatientMutation.mutate()}
      />
    </div>
  );
}

// --- Helper Components ---

function QuickStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex size-6 items-center justify-center rounded-md ${color}`}>
        <Icon className="size-3.5" />
      </div>
      <span className="text-xs text-muted-foreground">
        {value} {label}
      </span>
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

const SUMMARY_COLORS: Record<string, string> = {
  purple: "text-purple-600 bg-purple-500/10",
  green: "text-green-600 bg-green-500/10",
  yellow: "text-yellow-600 bg-yellow-500/10",
};

function SummaryMiniCard({
  icon: Icon,
  title,
  count,
  items,
  onMore,
  color,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  items: string[];
  onMore: () => void;
  color: string;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={onMore}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex size-8 items-center justify-center rounded-lg ${SUMMARY_COLORS[color]}`}>
              <Icon className="size-4" />
            </div>
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <Badge variant="secondary">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item, i) => (
              <p key={i} className="text-xs text-muted-foreground truncate">
                · {item}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">None recorded</p>
        )}
      </CardContent>
    </Card>
  );
}

type MedicalListItem = {
  id: string;
  name: string;
  status?: string;
  notes?: string | null;
  extra?: string | null;
  dateLabel?: string;
};

function MedicalList({
  items,
  emptyMessage,
  onRemove,
  removePending,
}: {
  items: MedicalListItem[];
  emptyMessage: string;
  onRemove: (id: string) => void;
  removePending: boolean;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-3">
            <Plus className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="divide-y"
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={staggerItem}
              layout
              className="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{item.name}</p>
                <div className="flex flex-wrap gap-2">
                  {item.status && (
                    <Badge
                      variant={STATUS_COLORS[item.status] ?? "outline"}
                      className="capitalize"
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  )}
                  {item.extra && (
                    <span className="text-xs text-muted-foreground">
                      {item.extra}
                    </span>
                  )}
                  {item.dateLabel && (
                    <span className="text-xs text-muted-foreground">
                      {item.dateLabel}
                    </span>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(item.id)}
                disabled={removePending}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </motion.div>
          ))}
        </motion.div>
      </CardContent>
    </Card>
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
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <Plus className="size-4 text-primary" aria-hidden />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
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
                      className="flex h-9 w-full rounded-lg border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
