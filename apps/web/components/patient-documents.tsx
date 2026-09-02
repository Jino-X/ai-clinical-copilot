"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Loader2,
  Sparkles,
  CheckCircle,
  Download,
  AlertCircle,
  Trash2,
} from "lucide-react";
import type {
  DocumentCategory,
  DocumentStatus,
  MedicalDocumentResponse,
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
import { getPublicEnv } from "@/lib/env";
import { ApiError } from "@/lib/api/client";
import {
  createUploadUrlApi,
  deleteDocumentApi,
  extractDocumentApi,
  getDocumentApi,
  getDocumentDownloadUrlApi,
  listDocumentsApi,
  verifyDocumentApi,
} from "@/lib/api/documents";

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  processing: { label: "Processing", variant: "default" },
  extracted: { label: "Extracted", variant: "default" },
  verified: { label: "Verified", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  lab_report: "Lab Report",
  imaging_report: "Imaging Report",
  prescription: "Prescription",
  referral_letter: "Referral Letter",
  discharge_summary: "Discharge Summary",
  clinical_note: "Clinical Note",
  insurance_document: "Insurance Document",
  identification: "Identification",
  other: "Other",
};

export function PatientDocuments({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", "patient", patientId],
    queryFn: () => listDocumentsApi(patientId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const title = file.name.replace(/\.[^.]+$/, "");
      const uploadUrl = await createUploadUrlApi(
        patientId,
        title,
        file.name,
        file.type || "application/octet-stream",
        file.size,
      );

      const { NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
      const response = await fetch(uploadUrl.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      return uploadUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "patient", patientId],
      });
      toast.success("Document uploaded");
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Upload failed",
      );
    },
    onSettled: () => setUploading(false),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    uploadMutation.mutate(file);
    // Reset input so the same file can be re-selected.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const listDeleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocumentApi(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "patient", patientId],
      });
      toast.success("Document deleted");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not delete"),
  });

  if (selectedDocId) {
    return (
      <DocumentDetail
        documentId={selectedDocId}
        patientId={patientId}
        onBack={() => setSelectedDocId(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" aria-hidden />
          Documents
        </CardTitle>
        <CardDescription>
          Upload medical documents for extraction and verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
            id="document-upload"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {uploading ? "Uploading…" : "Upload document"}
          </Button>
          <span className="text-xs text-muted-foreground">
            PDF, JPG, PNG, DOCX, TXT
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No documents uploaded yet.
          </p>
        ) : (
          <div className="space-y-1">
            {documents.map((doc) => {
              const config = STATUS_CONFIG[doc.status];
              return (
                <div
                  key={doc.id}
                  className="group flex w-full items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
                >
                  <button
                    onClick={() => setSelectedDocId(doc.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <FileText
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.file_name} ·{" "}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {doc.category && (
                      <Badge variant="outline" className="text-xs">
                        {CATEGORY_LABELS[doc.category]}
                      </Badge>
                    )}
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${doc.title}`}
                    disabled={listDeleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Delete "${doc.title}"? This cannot be undone.`,
                        )
                      ) {
                        listDeleteMutation.mutate(doc.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Document detail --------------------------------------------------------

function DocumentDetail({
  documentId,
  patientId,
  onBack,
}: {
  documentId: string;
  patientId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["documents", documentId],
    queryFn: () => getDocumentApi(documentId),
  });

  const extractMutation = useMutation({
    mutationFn: () => extractDocumentApi(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", documentId] });
      queryClient.invalidateQueries({
        queryKey: ["documents", "patient", patientId],
      });
      toast.success("Extraction completed");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Extraction failed",
      ),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyDocumentApi(documentId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", documentId] });
      queryClient.invalidateQueries({
        queryKey: ["documents", "patient", patientId],
      });
      toast.success("Document verified");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not verify"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocumentApi(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "patient", patientId],
      });
      queryClient.removeQueries({ queryKey: ["documents", documentId] });
      toast.success("Document deleted");
      onBack();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not delete"),
  });

  const handleDownload = async () => {
    try {
      const response = await getDocumentDownloadUrlApi(documentId);
      window.open(response.download_url, "_blank");
    } catch {
      toast.error("Could not get download URL");
    }
  };

  if (isLoading || !doc) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Loading document…</p>
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[doc.status];
  const canExtract = doc.status === "uploaded" || doc.status === "failed";
  const canVerify = doc.status === "extracted";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{doc.title}</CardTitle>
            <CardDescription>
              {doc.file_name} ·{" "}
              {new Date(doc.created_at).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to list
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="size-4" aria-hidden />
            Download
          </Button>
          {canExtract && (
            <Button
              size="sm"
              onClick={() => extractMutation.mutate()}
              disabled={extractMutation.isPending}
            >
              {extractMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Extract & classify
            </Button>
          )}
          {canVerify && (
            <Button
              size="sm"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
            >
              <CheckCircle className="size-4" aria-hidden />
              {verifyMutation.isPending ? "Verifying…" : "Verify"}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${doc.title}"? This cannot be undone.`,
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>

        {doc.error_message && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm">
            <AlertCircle
              className="size-4 text-destructive"
              aria-hidden
            />
            <span>{doc.error_message}</span>
          </div>
        )}

        {doc.category && (
          <div>
            <p className="text-sm font-medium">Category</p>
            <Badge variant="outline" className="mt-1">
              {CATEGORY_LABELS[doc.category]}
            </Badge>
          </div>
        )}

        {doc.extracted_data && (
          <>
            <Separator />
            <ExtractedDataView doc={doc} />
          </>
        )}

        {doc.verified_at && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <CheckCircle
              className="mb-1 inline size-4 text-muted-foreground"
              aria-hidden
            />{" "}
            Verified on {new Date(doc.verified_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExtractedDataView({ doc }: { doc: MedicalDocumentResponse }) {
  const data = doc.extracted_data as Record<string, unknown> | null;
  if (!data) return null;

  const summary = data.summary as string | undefined;
  const keyFindings = data.key_findings as string[] | undefined;
  const medications = data.medications as string[] | undefined;
  const conditions = data.conditions as string[] | undefined;
  const followUp = data.follow_up as string | undefined;
  const docDate = data.date as string | undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        AI-extracted information (draft)
      </p>

      {docDate && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Document date
          </p>
          <p className="text-sm">{docDate}</p>
        </div>
      )}

      {summary && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Summary</p>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      )}

      {keyFindings && keyFindings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Key findings
          </p>
          <ul className="mt-1 space-y-0.5">
            {keyFindings.map((f, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                • {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {medications && medications.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Medications
          </p>
          <ul className="mt-1 space-y-0.5">
            {medications.map((m, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                • {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {conditions && conditions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Conditions
          </p>
          <ul className="mt-1 space-y-0.5">
            {conditions.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                • {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {followUp && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Follow-up
          </p>
          <p className="text-sm text-muted-foreground">{followUp}</p>
        </div>
      )}
    </div>
  );
}
