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
} from "lucide-react";
import type {
  ConsentType,
  ConsultationStatus,
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

const STATUS_CONFIG: Record<
  ConsultationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

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

      // Upload directly to Supabase Storage via the signed URL.
      const uploadResponse = await fetch(uploadUrl.upload_url, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          "x-upsert": "true",
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
      queryClient.invalidateQueries({
        queryKey: ["consultations", consultationId],
      });
      toast.success("Audio uploaded");
    },
    onError: (e) => {
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

      // Auto-start the consultation if it's still scheduled.
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
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Loading consultation…</p>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[consultation.status];
  const canRecord =
    consultation.status === "scheduled" || consultation.status === "in_progress";
  const canComplete = consultation.status === "in_progress";
  const canCancel =
    consultation.status === "scheduled" || consultation.status === "in_progress";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {consultation.chief_complaint || "Consultation"}
            </h1>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(consultation.created_at).toLocaleString()}
            {consultation.duration_seconds && (
              <span>
                {" "}
                · {Math.floor(consultation.duration_seconds / 60)}m
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Consent section */}
      {canRecord && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" aria-hidden />
              Patient consent
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="size-4" aria-hidden />
              Recording
            </CardTitle>
            <CardDescription>
              Record the consultation audio. It will be sent for transcription
              after the consultation is completed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasAudioConsent && (
              <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">
                  Audio recording consent is required before recording.
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={!hasAudioConsent || isUploading}
                >
                  <Mic className="size-4" aria-hidden />
                  {consultation.audio_storage_path
                    ? "Re-record"
                    : "Start recording"}
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="size-4" aria-hidden />
                  Stop recording
                </Button>
              )}
              {isRecording && (
                <span className="flex items-center gap-2 text-sm text-destructive">
                  <span className="size-2 animate-pulse rounded-full bg-destructive" />
                  Recording…
                </span>
              )}
              {isUploading && (
                <span className="text-sm text-muted-foreground">
                  Uploading…
                </span>
              )}
            </div>
            {consultation.audio_storage_path && !isRecording && (
              <p className="text-xs text-muted-foreground">
                Audio attached ({formatBytes(consultation.audio_size_bytes)}).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audio playback */}
      {consultation.audio_storage_path && consultation.status === "completed" && (
        <AudioPlayer consultationId={consultationId} />
      )}

      {/* AI Documentation: transcription + SOAP note */}
      {consultation.status !== "cancelled" && (
        <SoapNoteEditor
          consultationId={consultationId}
          hasAudio={!!consultation.audio_storage_path}
          consultationStatus={consultation.status}
        />
      )}

      {/* Local AI Pipeline: normalize → extract → compare → summarize */}
      {consultation.status !== "cancelled" && consultation.audio_storage_path && (
        <AiPipeline consultationId={consultationId} />
      )}

      {/* State transitions */}
      {canComplete && (
        <div className="flex gap-3">
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            <CheckCircle className="size-4" aria-hidden />
            Complete consultation
          </Button>
        </div>
      )}

      {canCancel && (
        <Button
          variant="outline"
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
        >
          <XCircle className="size-4" aria-hidden />
          Cancel consultation
        </Button>
      )}

      {/* Doctor summary */}
      {consultation.doctor_summary && (
        <Card>
          <CardHeader>
            <CardTitle>Doctor summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {consultation.doctor_summary}
            </p>
          </CardContent>
        </Card>
      )}
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
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {granted ? (
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="size-3" aria-hidden />
          Granted
        </Badge>
      ) : (
        <Button size="sm" variant="outline" onClick={onGrant} disabled={pending}>
          Record consent
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
      const { getAudioDownloadUrlApi } = await import("@/lib/api/consultations");
      const response = await getAudioDownloadUrlApi(consultationId);
      setAudioUrl(response.download_url);
    } catch {
      toast.error("Could not load audio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="size-4" aria-hidden />
          Audio recording
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
