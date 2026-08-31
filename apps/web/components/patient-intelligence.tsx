"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Brain,
  Sparkles,
  Loader2,
  ArrowRight,
  GitCompare,
  MessageSquare,
  Send,
  AlertCircle,
} from "lucide-react";
import type {
  PatientQuestionResponse,
  PatientSummaryResponse,
  VisitComparisonResponse,
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api/client";
import {
  askPatientQuestionApi,
  compareVisitsApi,
  generatePatientSummaryApi,
} from "@/lib/api/intelligence";

type Tab = "summary" | "compare" | "qa";

export function PatientIntelligence({
  patientId,
  consultationIds,
}: {
  patientId: string;
  consultationIds: string[];
}) {
  const [tab, setTab] = useState<Tab>("summary");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4" aria-hidden />
          Patient Intelligence
        </CardTitle>
        <CardDescription>
          AI-assisted insights. Always a draft for physician review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <TabButton
            active={tab === "summary"}
            onClick={() => setTab("summary")}
            icon={<Sparkles className="size-3.5" aria-hidden />}
            label="Summary"
          />
          <TabButton
            active={tab === "compare"}
            onClick={() => setTab("compare")}
            icon={<GitCompare className="size-3.5" aria-hidden />}
            label="Compare"
          />
          <TabButton
            active={tab === "qa"}
            onClick={() => setTab("qa")}
            icon={<MessageSquare className="size-3.5" aria-hidden />}
            label="Ask"
          />
        </div>
        <Separator />
        {tab === "summary" && <SummaryTab patientId={patientId} />}
        {tab === "compare" && (
          <CompareTab patientId={patientId} consultationIds={consultationIds} />
        )}
        {tab === "qa" && <QaTab patientId={patientId} />}
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

// --- Summary tab -------------------------------------------------------------

function SummaryTab({ patientId }: { patientId: string }) {
  const [summary, setSummary] = useState<PatientSummaryResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => generatePatientSummaryApi(patientId),
    onSuccess: (data) => {
      setSummary(data);
      toast.success("Summary generated");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not generate summary",
      ),
  });

  return (
    <div className="space-y-3">
      {!summary && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generate a concise AI summary of this patient&apos;s history,
            including key conditions, medications, allergies, and recent
            activity.
          </p>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Generate summary
          </Button>
        </div>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            {summary.summary}
          </div>

          {summary.key_conditions.length > 0 && (
            <SectionList title="Key conditions" items={summary.key_conditions} />
          )}
          {summary.key_medications.length > 0 && (
            <SectionList
              title="Key medications"
              items={summary.key_medications}
            />
          )}
          {summary.key_allergies.length > 0 && (
            <SectionList title="Key allergies" items={summary.key_allergies} />
          )}

          {summary.recent_activity && (
            <div>
              <p className="text-sm font-medium">Recent activity</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.recent_activity}
              </p>
            </div>
          )}

          {summary.source_references.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Source references
              </p>
              <ul className="mt-1 space-y-0.5">
                {summary.source_references.map((ref, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {ref}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Compare tab -------------------------------------------------------------

function CompareTab({
  patientId,
  consultationIds,
}: {
  patientId: string;
  consultationIds: string[];
}) {
  const [previousId, setPreviousId] = useState(
    consultationIds[1] ?? consultationIds[0] ?? "",
  );
  const [currentId, setCurrentId] = useState(consultationIds[0] ?? "");
  const [result, setResult] = useState<VisitComparisonResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => compareVisitsApi(patientId, previousId, currentId),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Comparison generated");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not generate comparison",
      ),
  });

  if (consultationIds.length < 2) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
        <AlertCircle
          className="size-4 text-muted-foreground"
          aria-hidden
        />
        <span className="text-muted-foreground">
          At least two consultations are needed to compare visits.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Previous visit
          </label>
          <select
            value={previousId}
            onChange={(e) => setPreviousId(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {consultationIds.map((id) => (
              <option key={id} value={id}>
                {id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Current visit
          </label>
          <select
            value={currentId}
            onChange={(e) => setCurrentId(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {consultationIds.map((id) => (
              <option key={id} value={id}>
                {id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || previousId === currentId}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <GitCompare className="size-4" aria-hidden />
        )}
        Compare visits
      </Button>

      {previousId === currentId && (
        <p className="text-xs text-muted-foreground">
          Select two different visits to compare.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            {result.narrative}
          </div>

          {result.new_symptoms.length > 0 && (
            <ComparisonSection
              title="New symptoms"
              items={result.new_symptoms}
              variant="default"
            />
          )}
          {result.changed_symptoms.length > 0 && (
            <ComparisonSection
              title="Changed symptoms"
              items={result.changed_symptoms}
              variant="secondary"
            />
          )}
          {result.improved_symptoms.length > 0 && (
            <ComparisonSection
              title="Improved symptoms"
              items={result.improved_symptoms}
              variant="outline"
            />
          )}
          {result.worsened_symptoms.length > 0 && (
            <ComparisonSection
              title="Worsened symptoms"
              items={result.worsened_symptoms}
              variant="destructive"
            />
          )}
          {result.new_medications.length > 0 && (
            <ComparisonSection
              title="New medications"
              items={result.new_medications}
              variant="default"
            />
          )}
          {result.medication_changes.length > 0 && (
            <ComparisonSection
              title="Medication changes"
              items={result.medication_changes}
              variant="secondary"
            />
          )}
          {result.important_changes.length > 0 && (
            <ComparisonSection
              title="Important changes"
              items={result.important_changes}
              variant="secondary"
            />
          )}

          {result.source_references.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Source references
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.source_references.map((ref, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {ref}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Q&A tab -----------------------------------------------------------------

type QaItem = {
  question: string;
  answer: PatientQuestionResponse;
};

function QaTab({ patientId }: { patientId: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QaItem[]>([]);

  const mutation = useMutation({
    mutationFn: (q: string) => askPatientQuestionApi(patientId, q),
    onSuccess: (response) => {
      setHistory((prev) => [
        ...prev,
        { question, answer: response },
      ]);
      setQuestion("");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not answer question",
      ),
  });

  const suggestions = [
    "What medications has this patient used recently?",
    "What changed since the previous visit?",
    "Summarize the patient's history.",
    "When was the last blood test?",
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask a question about this patient&apos;s history. The AI answers
            only from authorized patient records.
          </p>
        )}
        {history.map((item, i) => (
          <div key={i} className="space-y-1 rounded-md border p-3">
            <p className="text-sm font-medium">
              <MessageSquare
                className="mr-1 inline size-3"
                aria-hidden
              />
              {item.question}
            </p>
            <p className="text-sm text-muted-foreground">
              {item.answer.answer}
            </p>
            {item.answer.source_references.length > 0 && (
              <div className="mt-1">
                <p className="text-xs text-muted-foreground">Sources:</p>
                <ul className="space-y-0.5">
                  {item.answer.source_references.map((ref, j) => (
                    <li
                      key={j}
                      className="text-xs text-muted-foreground"
                    >
                      {ref}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {history.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              onClick={() => setQuestion(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this patient..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (question.trim() && !mutation.isPending) {
                mutation.mutate(question);
              }
            }
          }}
        />
        <Button
          onClick={() => question.trim() && mutation.mutate(question)}
          disabled={mutation.isPending || !question.trim()}
          size="icon"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}

// --- Helpers -----------------------------------------------------------------

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item, i) => (
          <Badge key={i} variant={variant} className="text-xs">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
