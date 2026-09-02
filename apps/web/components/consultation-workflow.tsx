"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Languages,
  Stethoscope,
  GitCompare,
  FileText,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Save,
  X,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type {
  ClinicalExtraction,
  DoctorSummaryResponse,
  ExtractResponse,
  ProcessingStatusResponse,
  TranscriptResponse,
  VisitComparison,
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
import { ApiError } from "@/lib/api/client";
import {
  compareVisitsAiApi,
  extractClinicalInfoApi,
  generateSummaryApi,
  getExtractionApi,
  getProcessingStatusApi,
  getSummaryApi,
  getTranscriptApi,
  normalizeTranscriptApi,
  updateEnglishTextApi,
} from "@/lib/api/local-ai";

type WorkflowStep =
  | "transcript"
  | "normalize"
  | "verify"
  | "extract"
  | "compare"
  | "summary"
  | "complete";

const STEP_ORDER: WorkflowStep[] = [
  "transcript",
  "normalize",
  "verify",
  "extract",
  "compare",
  "summary",
  "complete",
];

const STEP_LABELS: Record<WorkflowStep, string> = {
  transcript: "Transcript",
  normalize: "Normalize",
  verify: "Verify & Edit",
  extract: "Extract",
  compare: "Compare",
  summary: "Summary",
  complete: "Complete",
};

export function ConsultationWorkflow({
  consultationId,
}: {
  consultationId: string;
}) {
  const queryClient = useQueryClient();
  const [comparison, setComparison] = useState<VisitComparison | null>(null);
  const [isEditingEnglish, setIsEditingEnglish] = useState(false);
  const [editedEnglishText, setEditedEnglishText] = useState("");

  const { data: status } = useQuery<ProcessingStatusResponse>({
    queryKey: ["consultations", consultationId, "processing-status"],
    queryFn: () => getProcessingStatusApi(consultationId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
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

  const { data: transcript } = useQuery<TranscriptResponse | null>({
    queryKey: ["consultations", consultationId, "transcript"],
    queryFn: () => getTranscriptApi(consultationId),
    enabled: !!status?.has_transcript,
  });

  const { data: extraction } = useQuery<ExtractResponse | null>({
    queryKey: ["consultations", consultationId, "extraction"],
    queryFn: () => getExtractionApi(consultationId),
    enabled: !!status?.has_extraction,
  });

  const { data: summary } = useQuery<DoctorSummaryResponse | null>({
    queryKey: ["consultations", consultationId, "summary"],
    queryFn: () => getSummaryApi(consultationId),
    enabled: !!status?.has_summary,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "processing-status"],
    });
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "transcript"],
    });
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "extraction"],
    });
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "summary"],
    });
  };

  // --- Mutations ---

  const normalizeMutation = useMutation({
    mutationFn: () => normalizeTranscriptApi(consultationId),
    onSuccess: () => {
      toast.success("English transcript generated");
      invalidateAll();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Normalization failed",
      ),
  });

  const updateEnglishMutation = useMutation({
    mutationFn: (englishText: string) =>
      updateEnglishTextApi(consultationId, { english_text: englishText }),
    onSuccess: () => {
      toast.success("English transcript updated");
      setIsEditingEnglish(false);
      invalidateAll();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Update failed",
      ),
  });

  const extractMutation = useMutation({
    mutationFn: () => extractClinicalInfoApi(consultationId),
    onSuccess: () => {
      toast.success("Clinical information extracted");
      invalidateAll();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Extraction failed",
      ),
  });

  const compareMutation = useMutation({
    mutationFn: () => compareVisitsAiApi(consultationId),
    onSuccess: (data) => {
      setComparison(data.comparison);
      toast.success("Visit comparison generated");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Comparison failed",
      ),
  });

  const summaryMutation = useMutation({
    mutationFn: () => generateSummaryApi(consultationId),
    onSuccess: () => {
      toast.success("Doctor summary generated");
      invalidateAll();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Summary generation failed",
      ),
  });

  // --- Derived state ---

  const hasTranscript = status?.has_transcript ?? false;
  const hasEnglish = status?.has_english_transcript ?? false;
  const hasExtraction = status?.has_extraction ?? false;
  const hasSummary = status?.has_summary ?? false;
  const hasComparison = comparison !== null;

  const isProcessing =
    normalizeMutation.isPending ||
    updateEnglishMutation.isPending ||
    extractMutation.isPending ||
    compareMutation.isPending ||
    summaryMutation.isPending;

  // Determine the current step
  let currentStep: WorkflowStep = "transcript";
  if (hasSummary && hasComparison) currentStep = "complete";
  else if (hasSummary) currentStep = "complete";
  else if (hasComparison) currentStep = "summary";
  else if (hasExtraction) currentStep = "compare";
  else if (hasEnglish) currentStep = "verify";
  else if (hasTranscript) currentStep = "normalize";

  const startEdit = () => {
    setEditedEnglishText(transcript?.english_text ?? "");
    setIsEditingEnglish(true);
  };

  const saveEdit = () => {
    if (!editedEnglishText.trim()) {
      toast.error("English text cannot be empty");
      return;
    }
    updateEnglishMutation.mutate(editedEnglishText);
  };

  const cancelEdit = () => {
    setIsEditingEnglish(false);
    setEditedEnglishText("");
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <Card className="animate-fade-in-up border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden />
            </div>
            AI Documentation Workflow
          </CardTitle>
          <CardDescription>
            Follow each step in order. Verify the normalized text before
            proceeding to extraction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1.5">
            {STEP_ORDER.map((step, idx) => {
              const stepIndex = STEP_ORDER.indexOf(currentStep);
              const stepNum = STEP_ORDER.indexOf(step);
              const isDone = stepNum < stepIndex;
              const isCurrent = stepNum === stepIndex;
              const isFuture = stepNum > stepIndex;

              return (
                <div key={step} className="flex items-center gap-1.5">
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-smooth ${
                      isCurrent
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="size-3.5" aria-hidden />
                    ) : isCurrent ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
                    ) : (
                      <span className="text-xs font-medium">{idx + 1}</span>
                    )}
                    <span className="font-medium">{STEP_LABELS[step]}</span>
                  </div>
                  {idx < STEP_ORDER.length - 1 && (
                    <ChevronRight
                      className={`size-4 ${isFuture ? "text-muted-foreground/40" : "text-muted-foreground"}`}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Transcript */}
      {hasTranscript && transcript && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" aria-hidden />
              </div>
              Original Transcript
              <Badge variant="outline" className="ml-1 text-xs">
                {transcript.language || "Auto-detected"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {transcript.full_text}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Transcribed by {transcript.provider}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Normalize */}
      {hasTranscript && !hasEnglish && (
        <Card className="animate-fade-in-up border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Languages className="size-4" aria-hidden />
              </div>
              Normalize to English
            </CardTitle>
            <CardDescription>
              Translate the transcript to English for clinical processing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => normalizeMutation.mutate()}
              disabled={isProcessing}
              className="gap-2"
            >
              {normalizeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Languages className="size-4" aria-hidden />
              )}
              Normalize to English
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verify & Edit English Text */}
      {hasEnglish && transcript?.english_text && (
        <Card className="animate-fade-in-up border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CheckCircle2 className="size-4" aria-hidden />
                </div>
                English-Normalized Text
                <Badge variant="outline" className="ml-1 gap-1 text-xs">
                  <span className="size-1.5 rounded-full bg-success" />
                  Ready for verification
                </Badge>
              </CardTitle>
              {!isEditingEnglish && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEdit}
                  disabled={isProcessing}
                  className="gap-1.5"
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Edit
                </Button>
              )}
            </div>
            <CardDescription>
              Review the English text below. If anything is incorrect, edit it
              before proceeding to extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditingEnglish ? (
              <div className="space-y-3">
                <Textarea
                  value={editedEnglishText}
                  onChange={(e) => setEditedEnglishText(e.target.value)}
                  rows={10}
                  className="resize-y"
                  placeholder="Edit the English-normalized text..."
                />
                <div className="flex gap-2">
                  <Button
                    onClick={saveEdit}
                    disabled={updateEnglishMutation.isPending}
                    className="gap-1.5"
                    size="sm"
                  >
                    {updateEnglishMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-3.5" aria-hidden />
                    )}
                    Save changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelEdit}
                    disabled={updateEnglishMutation.isPending}
                    className="gap-1.5"
                    size="sm"
                  >
                    <X className="size-3.5" aria-hidden />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {transcript.english_text}
                </p>
              </div>
            )}

            {!isEditingEnglish && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="size-3" aria-hidden />
                  Normalized by {transcript.english_provider || "AI"}{" "}
                  {transcript.english_model &&
                    `(${transcript.english_model})`}
                  {transcript.english_source_language &&
                    ` from ${transcript.english_source_language}`}
                </div>

                {/* Proceed to extraction */}
                {!hasExtraction && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle
                          className="size-4 text-primary"
                          aria-hidden
                        />
                        <span className="font-medium">
                          Ready for clinical extraction
                        </span>
                      </div>
                      <Button
                        onClick={() => extractMutation.mutate()}
                        disabled={isProcessing}
                        className="gap-2"
                      >
                        {extractMutation.isPending ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Stethoscope className="size-4" aria-hidden />
                        )}
                        Extract clinical information
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Re-normalize option if English already exists */}
      {hasEnglish && !isEditingEnglish && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => normalizeMutation.mutate()}
            disabled={isProcessing}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            {normalizeMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <Languages className="size-3" aria-hidden />
            )}
            Re-normalize from original
          </Button>
        </div>
      )}

      {/* Step 4: Clinical Extraction */}
      {extraction && (
        <Card className="animate-fade-in-up border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="size-4" aria-hidden />
              </div>
              Clinical Extraction
              <Badge variant="outline" className="ml-1 text-xs">
                Draft
              </Badge>
            </CardTitle>
            <CardDescription>
              AI-extracted clinical information. Verify before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExtractionDisplay extraction={extraction.extraction} />

            {!hasComparison && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle
                      className="size-4 text-primary"
                      aria-hidden
                    />
                    <span className="font-medium">
                      Ready for visit comparison
                    </span>
                  </div>
                  <Button
                    onClick={() => compareMutation.mutate()}
                    disabled={isProcessing}
                    className="gap-2"
                  >
                    {compareMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <GitCompare className="size-4" aria-hidden />
                    )}
                    Compare with previous visits
                  </Button>
                </div>
              </>
            )}

            {/* Re-extract option */}
            {hasComparison && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => extractMutation.mutate()}
                  disabled={isProcessing}
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  {extractMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Stethoscope className="size-3" aria-hidden />
                  )}
                  Re-extract
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Visit Comparison */}
      {comparison && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GitCompare className="size-4" aria-hidden />
              </div>
              Visit Comparison
            </CardTitle>
            <CardDescription>
              Changes compared to previous visits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ComparisonDisplay comparison={comparison} />

            {!hasSummary && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle
                      className="size-4 text-primary"
                      aria-hidden
                    />
                    <span className="font-medium">
                      Ready for doctor summary
                    </span>
                  </div>
                  <Button
                    onClick={() => summaryMutation.mutate()}
                    disabled={isProcessing}
                    className="gap-2"
                  >
                    {summaryMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <FileText className="size-4" aria-hidden />
                    )}
                    Generate doctor summary
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 6: Doctor Summary */}
      {summary && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" aria-hidden />
              </div>
              Doctor Summary
              <Badge variant="outline" className="ml-1 text-xs">
                Draft
              </Badge>
            </CardTitle>
            <CardDescription>
              AI-generated summary combining patient context and visit
              comparison.
            </CardDescription>
          </CardHeader>
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
              <Sparkles className="size-3" aria-hidden />
              Generated by {summary.provider} ({summary.model})
            </div>

            <Separator />

            <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3.5 text-sm">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <span className="text-primary">
                AI pipeline complete. Review and approve the SOAP note below.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No transcript yet */}
      {!hasTranscript && (
        <Card className="animate-fade-in-up">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle
              className="size-5 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Transcribe the audio first to start the AI documentation workflow.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExtractionDisplay({
  extraction,
}: {
  extraction: ClinicalExtraction;
}) {
  return (
    <div className="space-y-4">
      {extraction.chief_complaint && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Chief complaint
          </h4>
          <p className="text-sm">{extraction.chief_complaint}</p>
        </div>
      )}

      {extraction.symptoms.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Symptoms
          </h4>
          <div className="space-y-2">
            {extraction.symptoms.map((s, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">{s.name}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {s.duration && <span>Duration: {s.duration}</span>}
                  {s.severity && <span>Severity: {s.severity}</span>}
                  {s.onset && <span>Onset: {s.onset}</span>}
                  {s.trigger && <span>Trigger: {s.trigger}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {extraction.medical_conditions.length > 0 && (
        <TagList label="Medical conditions" items={extraction.medical_conditions} />
      )}

      {extraction.medications_mentioned.length > 0 && (
        <TagList
          label="Medications mentioned"
          items={extraction.medications_mentioned}
        />
      )}

      {extraction.allergies_mentioned.length > 0 && (
        <TagList
          label="Allergies mentioned"
          items={extraction.allergies_mentioned}
        />
      )}

      {extraction.tests_mentioned.length > 0 && (
        <TagList label="Tests mentioned" items={extraction.tests_mentioned} />
      )}

      {extraction.doctor_observations.length > 0 && (
        <TagList
          label="Doctor observations"
          items={extraction.doctor_observations}
        />
      )}

      {extraction.treatments_mentioned.length > 0 && (
        <TagList
          label="Treatments mentioned"
          items={extraction.treatments_mentioned}
        />
      )}

      {extraction.follow_up && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Follow-up
          </h4>
          <p className="text-sm">{extraction.follow_up}</p>
        </div>
      )}

      {extraction.important_information.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Important information
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
            {extraction.uncertainties.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">•</span>
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ComparisonDisplay({ comparison }: { comparison: VisitComparison }) {
  const changeColors: Record<string, string> = {
    new: "text-blue-600 dark:text-blue-400",
    improved: "text-green-600 dark:text-green-400",
    worsened: "text-red-600 dark:text-red-400",
    unchanged: "text-muted-foreground",
    resolved: "text-green-600 dark:text-green-400",
    unknown: "text-yellow-600 dark:text-yellow-400",
  };

  const changeBg: Record<string, string> = {
    new: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
    improved:
      "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30",
    worsened:
      "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    unchanged: "border-border bg-muted/30",
    resolved:
      "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30",
    unknown:
      "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30",
  };

  return (
    <div className="space-y-2">
      {comparison.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes detected.</p>
      ) : (
        <div className="space-y-2">
          {comparison.changes.map((c, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${changeBg[c.change] ?? "border-border bg-muted/30"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase ${changeColors[c.change] ?? ""}`}
                >
                  {c.change}
                </span>
                <span className="text-sm font-medium">{c.item}</span>
              </div>
              {(c.previous || c.current) && (
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {c.previous && <span>Was: {c.previous}</span>}
                  {c.previous && c.current && (
                    <span className="text-foreground">→</span>
                  )}
                  {c.current && <span>Now: {c.current}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
