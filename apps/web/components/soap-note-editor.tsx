"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  CheckCircle,
  XCircle,
  History,
  Sparkles,
  Loader2,
} from "lucide-react";
import type {
  ClinicalNoteResponse,
  NoteStatus,
  SoapNoteResponse,
} from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import {
  approveClinicalNoteApi,
  editClinicalNoteApi,
  generateSoapApi,
  getClinicalNoteApi,
  listNoteVersionsApi,
  rejectClinicalNoteApi,
  transcribeConsultationApi,
} from "@/lib/api/clinical-notes";

const NOTE_STATUS_CONFIG: Record<
  NoteStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  in_review: { label: "In Review", variant: "default" },
  approved: { label: "Approved", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const SOAP_SECTIONS = [
  { key: "subjective", label: "Subjective", isDraft: false },
  { key: "objective", label: "Objective", isDraft: false },
  { key: "assessment", label: "Assessment", isDraft: true },
  { key: "plan", label: "Plan", isDraft: true },
  { key: "follow_up", label: "Follow-up", isDraft: false },
] as const;

export function SoapNoteEditor({
  consultationId,
  hasAudio,
  consultationStatus,
}: {
  consultationId: string;
  hasAudio: boolean;
  consultationStatus: string;
}) {
  const queryClient = useQueryClient();
  const [showVersions, setShowVersions] = useState(false);

  // Fetch the clinical note for this consultation.
  // We try to fetch by consultation ID; if no note exists yet, that's fine.
  const {
    data: note,
    isLoading: noteLoading,
  } = useQuery({
    queryKey: ["clinical-notes", "consultation", consultationId],
    queryFn: async () => {
      try {
        return await getClinicalNoteApi(consultationId);
      } catch {
        return null;
      }
    },
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["clinical-notes", note?.id, "versions"],
    queryFn: () => listNoteVersionsApi(note!.id),
    enabled: !!note?.id,
  });

  // --- Transcription ---

  const transcribeMutation = useMutation({
    mutationFn: () => transcribeConsultationApi(consultationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-notes", "consultation", consultationId],
      });
      toast.success("Transcription completed");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Transcription failed",
      ),
  });

  // --- SOAP generation ---

  const generateSoapMutation = useMutation({
    mutationFn: () => generateSoapApi(consultationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-notes", "consultation", consultationId],
      });
      toast.success("SOAP note draft generated");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "SOAP generation failed",
      ),
  });

  // --- Edit ---

  const editMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      editClinicalNoteApi(note!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-notes", "consultation", consultationId],
      });
      toast.success("Note saved as new version");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });

  // --- Approve ---

  const approveMutation = useMutation({
    mutationFn: () => approveClinicalNoteApi(note!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-notes", "consultation", consultationId],
      });
      toast.success("Clinical note approved");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not approve"),
  });

  // --- Reject ---

  const rejectMutation = useMutation({
    mutationFn: () => rejectClinicalNoteApi(note!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-notes", "consultation", consultationId],
      });
      toast.success("AI draft rejected — you can write manually");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not reject"),
  });

  const canTranscribe = hasAudio && consultationStatus !== "cancelled";
  const canGenerateSoap = !!note || consultationStatus === "completed";
  const canEdit = note && note.status !== "approved" && note.status !== "rejected";
  const canApprove = note && note.status !== "approved" && note.status !== "rejected";
  const canReject = note && note.status === "draft";

  if (noteLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Loading clinical note…</p>
        </CardContent>
      </Card>
    );
  }

  // No note yet — show transcription and generation buttons.
  if (!note) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden />
            AI Documentation
          </CardTitle>
          <CardDescription>
            Transcribe the audio and generate a SOAP note draft. AI output is
            always a draft until you approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => transcribeMutation.mutate()}
              disabled={!canTranscribe || transcribeMutation.isPending}
            >
              {transcribeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Transcribe audio
            </Button>
            <Button
              onClick={() => generateSoapMutation.mutate()}
              disabled={!canGenerateSoap || generateSoapMutation.isPending}
            >
              {generateSoapMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Generate SOAP note
            </Button>
          </div>
          {!hasAudio && (
            <p className="text-xs text-muted-foreground">
              No audio attached. You can still generate a SOAP note if a
              transcript exists.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const statusConfig = NOTE_STATUS_CONFIG[note.status];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" aria-hidden />
                Clinical Note
              </CardTitle>
              <CardDescription>
                Version {note.current_version} ·{" "}
                {note.latest_version?.source === "ai_generated"
                  ? "AI-generated draft"
                  : note.latest_version?.source === "doctor_edited"
                    ? "Doctor-edited"
                    : note.latest_version?.source === "doctor_approved"
                      ? "Doctor-approved"
                      : "Unknown"}
              </CardDescription>
            </div>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {note.status === "approved" && note.approved_at && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <CheckCircle
                className="mb-1 inline size-4 text-muted-foreground"
                aria-hidden
              />{" "}
              Approved on{" "}
              {new Date(note.approved_at).toLocaleString()}
            </div>
          )}

          {canEdit ? (
            <SoapEditForm
              note={note}
              onSave={(data) => editMutation.mutate(data)}
              saving={editMutation.isPending}
            />
          ) : (
            <SoapReadView note={note} />
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="size-4" aria-hidden />
                {approveMutation.isPending ? "Approving…" : "Approve note"}
              </Button>
            )}
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="size-4" aria-hidden />
                {rejectMutation.isPending ? "Rejecting…" : "Reject draft"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowVersions(!showVersions)}
            >
              <History className="size-4" aria-hidden />
              {showVersions ? "Hide" : "Show"} versions ({versions.length})
            </Button>
          </div>

          {showVersions && (
            <div className="space-y-2">
              <Separator />
              <p className="text-sm font-medium">Version history</p>
              {versions.map((v) => (
                <VersionRow key={v.version} version={v} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SoapReadView({ note }: { note: ClinicalNoteResponse }) {
  const v = note.latest_version;
  if (!v) return <p className="text-sm text-muted-foreground">No content.</p>;

  return (
    <div className="space-y-3">
      {SOAP_SECTIONS.map((section) => (
        <div key={section.key}>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{section.label}</Label>
            {section.isDraft && (
              <Badge variant="secondary" className="text-xs">
                Draft
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
            {v[section.key] || "Not found in available patient records."}
          </p>
        </div>
      ))}
    </div>
  );
}

function SoapEditForm({
  note,
  onSave,
  saving,
}: {
  note: ClinicalNoteResponse;
  onSave: (data: Record<string, string>) => void;
  saving: boolean;
}) {
  const v = note.latest_version;
  const [subjective, setSubjective] = useState(v?.subjective ?? "");
  const [objective, setObjective] = useState(v?.objective ?? "");
  const [assessment, setAssessment] = useState(v?.assessment ?? "");
  const [plan, setPlan] = useState(v?.plan ?? "");
  const [followUp, setFollowUp] = useState(v?.follow_up ?? "");

  const fields = [
    { key: "subjective", label: "Subjective", value: subjective, set: setSubjective, isDraft: false },
    { key: "objective", label: "Objective", value: objective, set: setObjective, isDraft: false },
    { key: "assessment", label: "Assessment", value: assessment, set: setAssessment, isDraft: true },
    { key: "plan", label: "Plan", value: plan, set: setPlan, isDraft: true },
    { key: "follow_up", label: "Follow-up", value: followUp, set: setFollowUp, isDraft: false },
  ];

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            {field.isDraft && (
              <Badge variant="secondary" className="text-xs">
                Draft
              </Badge>
            )}
          </div>
          <Textarea
            value={field.value}
            onChange={(e) => field.set(e.target.value)}
            rows={3}
            className="mt-1"
          />
        </div>
      ))}
      <Button
        size="sm"
        onClick={() =>
          onSave({
            subjective,
            objective,
            assessment,
            plan,
            follow_up: followUp,
          })
        }
        disabled={saving}
      >
        {saving ? "Saving…" : "Save as new version"}
      </Button>
    </div>
  );
}

function VersionRow({ version }: { version: SoapNoteResponse }) {
  const sourceLabel =
    version.source === "ai_generated"
      ? "AI generated"
      : version.source === "doctor_edited"
        ? "Doctor edited"
        : "Doctor approved";

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">v{version.version}</span>
        <Badge variant="outline" className="text-xs">
          {sourceLabel}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {new Date(version.created_at).toLocaleString()}
        {version.edit_note && ` · ${version.edit_note}`}
      </p>
    </div>
  );
}
