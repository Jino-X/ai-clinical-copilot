"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Mic,
  Square,
  CheckCircle,
  XCircle,
  Play,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  FileText,
  Languages,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
} from "lucide-react";
import type {
  ConsentType,
  ClinicalExtraction,
} from "@clinical-copilot/shared-types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPublicEnv } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/clinical";
import { SoapNoteEditor } from "@/components/soap-note-editor";
import { AiPipeline } from "@/components/ai-pipeline";
import { ApiError } from "@/lib/api/client";
import {
  cancelConsultationApi,
  completeConsultationApi,
  confirmAudioUploadApi,
  createUploadUrlApi,
  getConsultationApi,
  grantConsentApi,
  listConsentsApi,
  startConsultationApi,
} from "@/lib/api/consultations";
import {
  getProcessingStatusApi,
  getExtractionApi,
  getSummaryApi,
} from "@/lib/api/local-ai";

export default function ConsultationDetailPage() {
  const params = useParams<{ consultationId: string }>();
  const consultationId = params.consultationId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: consultation, isLoading } = useQuery({
    queryKey: ["consultations", consultationId],
    queryFn: () => getConsultationApi(consultationId),
  });

  const { data: consents = [] } = useQuery({
    queryKey: ["consultations", consultationId, "consents"],
    queryFn: () => listConsentsApi(consultationId),
  });

  const { data: processingStatus } = useQuery({
    queryKey: ["consultations", consultationId, "processing-status"],
    queryFn: () => getProcessingStatusApi(consultationId),
    enabled: !!consultation?.audio_storage_path,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // Poll while processing
      if (
        data.stage === "transcribing" ||
        data.stage === "normalizing" ||
        data.stage === "extracting" ||
        data.stage === "summarizing"
      ) {
        return 3000;
      }
      return false;
    },
  });

  const { data: extraction } = useQuery({
    queryKey: ["consultations", consultationId, "extraction"],
    queryFn: () => getExtractionApi(consultationId),
    enabled: !!processingStatus?.has_extraction,
  });

  const { data: summary } = useQuery({
    queryKey: ["consultations", consultationId, "summary"],
    queryFn: () => getSummaryApi(consultationId),
    enabled: !!processingStatus?.has_summary,
  });

  const hasAudioConsent = consents.some(
    (c) => c.consent_type === "audio_recording" && c.granted,
  );
  const hasAiConsent = consents.some(
    (c) => c.consent_type === "ai_processing" && c.granted,
  );

  // --- State transitions ---

  const startMutation = useMutation({
    mutationFn: () => startConsultationApi(consultationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId],
      });
      toast.success("Consultation started");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeConsultationApi(consultationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId],
      });
      toast.success("Consultation completed");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelConsultationApi(consultationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId],
      });
      toast.success("Consultation cancelled");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  // --- Consent ---

  const consentMutation = useMutation({
    mutationFn: (type: ConsentType) =>
      grantConsentApi(consultationId, {
        patient_id: consultation?.patient_id ?? "",
        consultation_id: consultationId,
        consent_type: type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId, "consents"],
      });
      toast.success("Consent recorded");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  // --- Audio recording ---

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const uploadUrl = await createUploadUrlApi(
        consultationId,
        blob.type || "audio/webm",
        blob.size,
      );

      const { NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
      const uploadResponse = await fetch(uploadUrl.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      return confirmAudioUploadApi(
        consultationId,
        uploadUrl.storage_path,
        blob.type || "audio/webm",
        blob.size,
      );
    },
    onSuccess: () => {
      setIsUploading(false);
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId],
      });
      toast.success("Audio uploaded successfully");
    },
    onError: (e) => {
      setIsUploading(false);
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Upload failed",
      );
    },
  });

  const startRecording = async () => {
    if (!consultation) return;
    if (!hasAudioConsent) {
      toast.error("Audio recording consent is required before recording");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        setIsUploading(true);
        uploadMutation.mutate(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      if (consultation.status === "scheduled") {
        startMutation.mutate();
      }
    } catch {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  if (isLoading || !consultation) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex animate-fade-in items-center gap-3 py-12">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading consultation…
          </p>
        </div>
      </div>
    );
  }

  const canRecord =
    consultation.status === "scheduled" ||
    consultation.status === "in_progress";
  const canComplete = consultation.status === "in_progress";
  const canCancel =
    consultation.status === "scheduled" ||
    consultation.status === "in_progress";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex animate-fade-in-down items-start gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          aria-label="Back"
          className="transition-smooth hover:bg-accent"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {consultation.chief_complaint || "Consultation"}
            </h1>
            <StatusBadge status={consultation.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" aria-hidden />
              {new Date(consultation.created_at).toLocaleString()}
            </div>
            {consultation.duration_seconds && (
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                  {Math.floor(consultation.duration_seconds / 60)}m{" "}
                  {consultation.duration_seconds % 60}s
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Consent section */}
      {canRecord && (
        <Card
          className="animate-fade-in-up border-border/60 opacity-0"
          style={{ animationDelay: "100ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" aria-hidden />
              </div>
              Patient Consent
            </CardTitle>
            <CardDescription>
              Record patient consent before recording or processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ConsentRow
              label="Audio recording"
              description="Patient consents to audio recording of the consultation."
              granted={hasAudioConsent}
              onGrant={() => consentMutation.mutate("audio_recording")}
              pending={consentMutation.isPending}
            />
            <Separator />
            <ConsentRow
              label="AI processing"
              description="Patient consents to AI-assisted documentation."
              granted={hasAiConsent}
              onGrant={() => consentMutation.mutate("ai_processing")}
              pending={consentMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Recording section */}
      {canRecord && (
        <Card
          className="animate-fade-in-up border-border/60 opacity-0"
          style={{ animationDelay: "150ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mic className="size-4" aria-hidden />
              </div>
              Audio Recording
            </CardTitle>
            <CardDescription>
              Record the consultation audio. It will be sent for transcription
              after the consultation is completed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasAudioConsent && (
              <div className="flex items-center gap-2.5 rounded-lg bg-warning/10 p-3.5 text-sm">
                <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden />
                <span className="text-warning-foreground">
                  Audio recording consent is required before recording.
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={!hasAudioConsent || isUploading}
                  className="gap-2"
                  size="lg"
                >
                  <Mic className="size-4" aria-hidden />
                  {consultation.audio_storage_path
                    ? "Re-record"
                    : "Start recording"}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={stopRecording}
                  className="animate-scale-in gap-2"
                  size="lg"
                >
                  <Square className="size-4" aria-hidden />
                  Stop recording
                </Button>
              )}
              {isRecording && (
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center">
                    <span className="pulse-ring absolute size-3 rounded-full bg-destructive" />
                    <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                  </div>
                  <span className="animate-recording-pulse text-sm font-medium text-destructive">
                    Recording…
                  </span>
                </div>
              )}
              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Uploading…
                </div>
              )}
            </div>
            {consultation.audio_storage_path && !isRecording && (
              <div className="flex items-center gap-2.5 rounded-lg bg-success/10 p-3.5 text-sm">
                <CheckCircle className="size-4 shrink-0 text-success" aria-hidden />
                <span className="text-success-foreground">
                  Audio attached ({formatBytes(consultation.audio_size_bytes)})
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audio playback */}
      {consultation.audio_storage_path &&
        consultation.status === "completed" && (
          <AudioPlayer consultationId={consultationId} />
        )}

      {/* AI Pipeline with Transcript & Extraction Display */}
      {consultation.status !== "cancelled" &&
        consultation.audio_storage_path && (
          <div className="space-y-6">
            <AiPipeline consultationId={consultationId} />

            {/* Transcript & Normalized Text */}
            {processingStatus?.has_english_transcript && (
              <TranscriptViewer consultationId={consultationId} />
            )}

            {/* Clinical Extraction */}
            {extraction && (
              <ClinicalExtractionCard extraction={extraction.extraction} />
            )}

            {/* Visit Comparison & Summary */}
            {summary && <DoctorSummaryCard summary={summary} />}
          </div>
        )}

      {/* SOAP Note Editor */}
      {consultation.status !== "cancelled" && (
        <SoapNoteEditor
          consultationId={consultationId}
          hasAudio={!!consultation.audio_storage_path}
          consultationStatus={consultation.status}
        />
      )}

      {/* State transitions */}
      <div className="flex flex-wrap gap-3">
        {canComplete && (
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            size="lg"
            className="gap-2"
          >
            <CheckCircle className="size-4" aria-hidden />
            Complete consultation
          </Button>
        )}

        {canCancel && (
          <Button
            variant="outline"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            size="lg"
            className="gap-2"
          >
            <XCircle className="size-4" aria-hidden />
            Cancel consultation
          </Button>
        )}
      </div>
    </div>
  );
}

function ConsentRow({
  label,
  description,
  granted,
  onGrant,
  pending,
}: {
  label: string;
  description: string;
  granted: boolean;
  onGrant: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between transition-smooth">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 items-center justify-center rounded-lg transition-smooth ${granted ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
        >
          <ShieldCheck className="size-4" aria-hidden />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {granted ? (
        <Badge
          variant="outline"
          className="gap-1.5 border-success/30 bg-success/5 text-success"
        >
          <span className="size-1.5 rounded-full bg-success" />
          Granted
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onGrant}
          disabled={pending}
          className="transition-smooth"
        >
          {pending ? "Recording…" : "Record consent"}
        </Button>
      )}
    </div>
  );
}

function AudioPlayer({ consultationId }: { consultationId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAudio = async () => {
    setLoading(true);
    try {
      const { getAudioDownloadUrlApi } = await import(
        "@/lib/api/consultations"
      );
      const response = await getAudioDownloadUrlApi(consultationId);
      setAudioUrl(response.download_url);
    } catch {
      toast.error("Could not load audio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Play className="size-4" aria-hidden />
          </div>
          Audio Recording
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!audioUrl ? (
          <Button variant="outline" onClick={loadAudio} disabled={loading}>
            {loading ? "Loading…" : "Load audio"}
          </Button>
        ) : (
          <audio controls src={audioUrl} className="w-full">
            Your browser does not support audio playback.
          </audio>
        )}
      </CardContent>
    </Card>
  );
}

function TranscriptViewer({ consultationId }: { consultationId: string }) {
  const [expanded, setExpanded] = useState(false);

  // In a real implementation, you'd fetch the actual transcript data
  // For now, we'll show a placeholder that uses the normalized text from processing status
  const { data: processingStatus } = useQuery({
    queryKey: ["consultations", consultationId, "processing-status"],
    queryFn: () => getProcessingStatusApi(consultationId),
  });

  if (!processingStatus?.has_english_transcript) return null;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Languages className="size-4" aria-hidden />
            </div>
            Transcript & Normalized Text
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1.5"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                Expand
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Original transcription and English-normalized text for verification.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Original Transcript</h4>
              <Badge variant="outline" className="text-xs">
                Tamil
              </Badge>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <p className="text-muted-foreground italic">
                Original transcript will be displayed here after transcription
                is complete.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-sm font-medium">Normalized English Text</h4>
              <Badge variant="outline" className="gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-success" />
                Verified
              </Badge>
            </div>
            <div className="rounded-lg border bg-card p-4 text-sm">
              <p className="leading-relaxed">
                English-normalized transcript will be displayed here for doctor
                verification.
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ClinicalExtractionCard({
  extraction,
}: {
  extraction: ClinicalExtraction;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="animate-fade-in-up border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Stethoscope className="size-4" aria-hidden />
            </div>
            Clinical Extraction (Draft)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1.5"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                Expand
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          AI-extracted clinical information. Please verify before approval.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {extraction.chief_complaint && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Chief complaint:
              </h4>
              <p className="text-sm">{extraction.chief_complaint}</p>
            </div>
          )}

          {extraction.symptoms.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Symptoms:
              </h4>
              <div className="space-y-2">
                {extraction.symptoms.map((symptom, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm font-medium">{symptom.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {symptom.duration && (
                        <span>Duration: {symptom.duration}</span>
                      )}
                      {symptom.severity && (
                        <span>• Severity: {symptom.severity}</span>
                      )}
                      {symptom.onset && <span>• Onset: {symptom.onset}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {extraction.medical_conditions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Medical conditions:
              </h4>
              <div className="flex flex-wrap gap-2">
                {extraction.medical_conditions.map((condition, i) => (
                  <Badge key={i} variant="secondary">
                    {condition}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {extraction.medications_mentioned.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Medications mentioned:
              </h4>
              <div className="flex flex-wrap gap-2">
                {extraction.medications_mentioned.map((med, i) => (
                  <Badge key={i} variant="outline">
                    {med}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {extraction.important_information.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Important information:
              </h4>
              <ul className="space-y-1 text-sm">
                {extraction.important_information.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extraction.uncertainties.length > 0 && (
            <div className="space-y-2 rounded-lg bg-warning/5 p-3">
              <h4 className="text-sm font-medium text-warning">
                Uncertainties (requires verification):
              </h4>
              <ul className="space-y-1 text-sm text-warning-foreground">
                {extraction.uncertainties.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-warning">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DoctorSummaryCard({
  summary,
}: {
  summary: {
    summary: string;
    source_references: string[];
    provider: string;
    model: string;
  };
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" aria-hidden />
            </div>
            Doctor-Facing Summary (Draft)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1.5"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                Expand
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          AI-generated summary combining patient context and visit comparison.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {summary.summary}
            </p>
          </div>

          {summary.source_references.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Source references:
              </h4>
              <div className="flex flex-wrap gap-2">
                {summary.source_references.map((ref, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {ref}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            Generated by {summary.provider} ({summary.model})
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${Math.round(size)} ${units[unit]}`;
}
