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
  RefreshCw,
} from "lucide-react";
import type {
  ClinicalExtraction,
  DoctorSummaryResponse,
  ExtractResponse,
  ProcessingStatusResponse,
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
import { ApiError } from "@/lib/api/client";
import {
  compareVisitsAiApi,
  extractClinicalInfoApi,
  generateSummaryApi,
  getExtractionApi,
  getProcessingStatusApi,
  getSummaryApi,
  normalizeTranscriptApi,
} from "@/lib/api/local-ai";

type Stage =
  | "idle"
  | "normalizing"
  | "extracting"
  | "comparing"
  | "summarizing"
  | "done";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Ready",
  normalizing: "Normalizing to English…",
  extracting: "Extracting clinical information…",
  comparing: "Comparing with previous visits…",
  summarizing: "Generating doctor summary…",
  done: "Complete",
};

export function AiPipeline({ consultationId }: { consultationId: string }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("idle");
  const [comparison, setComparison] = useState<VisitComparison | null>(null);

  const { data: status } = useQuery<ProcessingStatusResponse>({
    queryKey: ["consultations", consultationId, "processing-status"],
    queryFn: () => getProcessingStatusApi(consultationId),
  });

  const { data: extraction } = useQuery<ExtractResponse | null>({
    queryKey: ["consultations", consultationId, "extraction"],
    queryFn: () => getExtractionApi(consultationId),
  });

  const { data: summary } = useQuery<DoctorSummaryResponse | null>({
    queryKey: ["consultations", consultationId, "summary"],
    queryFn: () => getSummaryApi(consultationId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "processing-status"],
    });
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "extraction"],
    });
    queryClient.invalidateQueries({
      queryKey: ["consultations", consultationId, "summary"],
    });
  };

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

  const runFullPipeline = async () => {
    setStage("normalizing");
    try {
      await normalizeTranscriptApi(consultationId);
      invalidateAll();

      setStage("extracting");
      await extractClinicalInfoApi(consultationId);
      invalidateAll();

      setStage("summarizing");
      await generateSummaryApi(consultationId);
      invalidateAll();

      setStage("done");
      toast.success("AI pipeline complete");
    } catch (e) {
      setStage("idle");
      toast.error(
        e instanceof ApiError ? e.message : "Pipeline failed",
      );
    }
  };

  const hasTranscript = status?.has_transcript ?? false;
  const hasEnglish = status?.has_english_transcript ?? false;
  const hasExtraction = status?.has_extraction ?? false;
  const hasSummary = status?.has_summary ?? false;

  const isProcessing =
    normalizeMutation.isPending ||
    extractMutation.isPending ||
    compareMutation.isPending ||
    summaryMutation.isPending ||
    stage !== "idle" && stage !== "done";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="size-5" aria-hidden />
          AI Clinical Pipeline
        </CardTitle>
        <CardDescription>
          Transcribe → Normalize → Extract → Compare → Summarize
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pipeline status indicators */}
        <div className="flex flex-wrap gap-2">
          <StageBadge
            label="Transcript"
            done={hasTranscript}
          />
          <StageBadge
            label="English"
            done={hasEnglish}
          />
          <StageBadge
            label="Extraction"
            done={hasExtraction}
          />
          <StageBadge
            label="Summary"
            done={hasSummary}
          />
        </div>

        {stage !== "idle" && stage !== "done" && (
          <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {STAGE_LABELS[stage]}
          </div>
        )}

        {!hasTranscript && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-sm">
            <AlertCircle
              className="size-4 text-muted-foreground"
              aria-hidden
            />
            <span className="text-muted-foreground">
              Transcribe the audio first to enable the AI pipeline.
            </span>
          </div>
        )}

        {/* Action buttons */}
        {hasTranscript && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => normalizeMutation.mutate()}
              disabled={isProcessing}
            >
              {normalizeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Languages className="size-4" aria-hidden />
              )}
              {hasEnglish ? "Re-normalize" : "Normalize to English"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => extractMutation.mutate()}
              disabled={isProcessing || !hasEnglish}
            >
              {extractMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Stethoscope className="size-4" aria-hidden />
              )}
              {hasExtraction ? "Re-extract" : "Extract clinical info"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => compareMutation.mutate()}
              disabled={isProcessing || !hasExtraction}
            >
              {compareMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <GitCompare className="size-4" aria-hidden />
              )}
              Compare visits
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => summaryMutation.mutate()}
              disabled={isProcessing || !hasExtraction}
            >
              {summaryMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="size-4" aria-hidden />
              )}
              {hasSummary ? "Regenerate summary" : "Generate summary"}
            </Button>

            <Button
              size="sm"
              onClick={runFullPipeline}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Run full pipeline
            </Button>
          </div>
        )}

        {/* English transcript */}
        {hasEnglish && status && (
          <>
            <Separator />
            <EnglishTranscriptSection />
          </>
        )}

        {/* Clinical extraction */}
        {extraction && (
          <>
            <Separator />
            <ExtractionDisplay extraction={extraction.extraction} />
          </>
        )}

        {/* Visit comparison */}
        {comparison && (
          <>
            <Separator />
            <ComparisonDisplay comparison={comparison} />
          </>
        )}

        {/* Doctor summary */}
        {summary && (
          <>
            <Separator />
            <SummaryDisplay summary={summary} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StageBadge({ label, done }: { label: string; done: boolean }) {
  return (
    <Badge variant={done ? "default" : "outline"} className="gap-1">
      {done ? (
        <CheckCircle2 className="size-3" aria-hidden />
      ) : (
        <div className="size-3 rounded-full border" aria-hidden />
      )}
      {label}
    </Badge>
  );
}

function EnglishTranscriptSection() {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">English Transcript</h4>
      <p className="text-sm text-muted-foreground">
        English-normalized transcript is available. Use the &quot;Extract
        clinical info&quot; button to process it.
      </p>
    </div>
  );
}

function ExtractionDisplay({
  extraction,
}: {
  extraction: ClinicalExtraction;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Clinical Extraction (Draft)</h4>

      {extraction.chief_complaint && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Chief complaint:
          </span>
          <p className="text-sm">{extraction.chief_complaint}</p>
        </div>
      )}

      {extraction.symptoms.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Symptoms:
          </span>
          <ul className="mt-1 space-y-1">
            {extraction.symptoms.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{s.name}</span>
                {s.duration && ` — duration: ${s.duration}`}
                {s.severity && ` — severity: ${s.severity}`}
                {s.onset && ` — onset: ${s.onset}`}
                {s.trigger && ` — trigger: ${s.trigger}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {extraction.medical_conditions.length > 0 && (
        <ListSection
          label="Conditions mentioned"
          items={extraction.medical_conditions}
        />
      )}

      {extraction.medications_mentioned.length > 0 && (
        <ListSection
          label="Medications mentioned"
          items={extraction.medications_mentioned}
        />
      )}

      {extraction.allergies_mentioned.length > 0 && (
        <ListSection
          label="Allergies mentioned"
          items={extraction.allergies_mentioned}
        />
      )}

      {extraction.tests_mentioned.length > 0 && (
        <ListSection
          label="Tests mentioned"
          items={extraction.tests_mentioned}
        />
      )}

      {extraction.doctor_observations.length > 0 && (
        <ListSection
          label="Doctor observations"
          items={extraction.doctor_observations}
        />
      )}

      {extraction.treatments_mentioned.length > 0 && (
        <ListSection
          label="Treatments mentioned"
          items={extraction.treatments_mentioned}
        />
      )}

      {extraction.follow_up && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Follow-up:
          </span>
          <p className="text-sm">{extraction.follow_up}</p>
        </div>
      )}

      {extraction.important_information.length > 0 && (
        <ListSection
          label="Important information"
          items={extraction.important_information}
        />
      )}

      {extraction.uncertainties.length > 0 && (
        <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-950/30">
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
            Uncertainties:
          </span>
          <ul className="mt-1 space-y-0.5">
            {extraction.uncertainties.map((u, i) => (
              <li
                key={i}
                className="text-sm text-yellow-800 dark:text-yellow-300"
              >
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ListSection({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}:
      </span>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            {item}
          </li>
        ))}
      </ul>
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

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Visit Comparison</h4>
      {comparison.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes detected.</p>
      ) : (
        <ul className="space-y-1">
          {comparison.changes.map((c, i) => (
            <li key={i} className="text-sm">
              <span className={`font-medium ${changeColors[c.change] ?? ""}`}>
                {c.change.toUpperCase()}:
              </span>{" "}
              <span className="font-medium">{c.item}</span>
              {c.previous && (
                <span className="text-muted-foreground">
                  {" "}
                  (was: {c.previous})
                </span>
              )}
              {c.current && (
                <span className="text-muted-foreground">
                  {" "}
                  → {c.current}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryDisplay({ summary }: { summary: DoctorSummaryResponse }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Doctor-Facing Summary (Draft)</h4>
      <div className="rounded-md border p-3">
        <p className="whitespace-pre-wrap text-sm">{summary.summary}</p>
      </div>
      {summary.source_references.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Source references:
          </span>
          <ul className="mt-1 space-y-0.5">
            {summary.source_references.map((ref, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {ref}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
