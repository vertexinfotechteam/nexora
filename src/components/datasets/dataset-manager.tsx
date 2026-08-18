"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { cn, formatBytes, relativeTime } from "@/lib/utils";
import type { Dataset } from "@/lib/store/types";

const ACCEPT = ".csv,.tsv,.xlsx,.json,.parquet,.pdf";

/**
 * Turns a storage rejection into something the person can act on.
 *
 * Storage enforces a per-file ceiling of its own, set for the whole project
 * rather than by this app, and when a file exceeds it the message that comes
 * back names no number and no place to change it. Someone uploading a 60 MB
 * export would be told only that their file "exceeded the maximum allowed
 * size" — true, but it reads as though the file were at fault, and the app
 * had already accepted that size a moment earlier.
 */
function storageMessage(message: string, sizeBytes: number): string {
  if (/exceed|too large|maximum allowed size|413/i.test(message)) {
    return `${formatBytes(sizeBytes)} is over the file size limit set on the storage project, which is lower than this app allows. Raising it (Supabase → Storage → Settings) lets files this large through; until then, a smaller file or a split export will work.`;
  }
  return `Upload failed: ${message}`;
}

export function DatasetManager({ datasets }: { datasets: Dataset[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setProgress(`Uploading ${file.name}…`);

    try {
      /*
       * Three steps, so the file never passes through our own server.
       *
       * Posting it to a route meant every byte travelled through the
       * serverless function, which caps the whole product at whatever request
       * body the host accepts — 4.5 MB on Vercel, unchangeable on any plan.
       * The browser now asks for a one-time URL, sends the file straight to
       * storage, and only then asks the server to read it back and profile it.
       * The two calls to our own API carry a few hundred bytes each.
       */
      setProgress(`Preparing ${file.name}…`);
      const ticketResponse = await fetch("/api/datasets/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) {
        throw new Error(
          [ticket.error, ticket.hint].filter(Boolean).join(" ") || "The upload failed.",
        );
      }

      setProgress(
        `Uploading ${file.name} (${formatBytes(file.size)})${
          file.size > 8 * 1024 * 1024 ? " — large files take a moment" : ""
        }…`,
      );
      const storage = getBrowserSupabase();
      if (!storage) throw new Error("Storage is not available in this browser session.");

      const sent = await storage.storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.storagePath, ticket.token, file);

      if (sent.error) throw new Error(storageMessage(sent.error.message, file.size));

      setProgress("Validating and profiling — this runs the real pipeline…");
      const response = await fetch("/api/datasets/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          datasetId: ticket.datasetId,
          storagePath: ticket.storagePath,
          fileName: ticket.fileName,
          sizeBytes: file.size,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          [data.error, data.hint].filter(Boolean).join(" ") || "The upload failed.",
        );
      }

      toast.success(
        `${data.dataset.name} is ready — ${data.quality.rowCount.toLocaleString()} rows, quality ${data.quality.score}/100`,
      );
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (dataset: Dataset) => {
    if (
      !confirm(
        `Delete "${dataset.name}"? The uploaded file and its analysis history are removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(dataset.id);
    try {
      const response = await fetch(`/api/datasets/${dataset.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "The dataset could not be deleted.");
      }
      toast.success(`${dataset.name} deleted.`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload */}
      <Card
        className={cn(
          "transition-colors",
          dragging && "border-[var(--nx-accent)] bg-[var(--nx-accent-soft)]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !uploading) upload(file);
        }}
      >
        <CardBody className="flex flex-col items-center gap-2 py-7 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nx-border-subtle)]">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--nx-accent)]" />
            ) : (
              <Upload className="h-4 w-4 text-[var(--nx-text-muted)]" />
            )}
          </div>
          <p className="text-[13px] font-medium">
            {uploading ? progress : "Drop a data file here, or choose one"}
          </p>
          <p className="max-w-md text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
            CSV, TSV, XLSX, JSON or Parquet. The file is stored privately, then
            profiled column by column — row counts, missing values, duplicates,
            distributions and outliers are all measured, not sampled.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button
            variant="accent"
            className="mt-1"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Choose a file
          </Button>
        </CardBody>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Database className="h-3.5 w-3.5" />
            My datasets
          </CardTitle>
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            {datasets.length} total
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {datasets.length === 0 ? (
            <EmptyState
              icon={<Database className="h-4 w-4" />}
              title="No datasets yet"
              description="Upload a file above to get started. Nothing is shown on the dashboard until real data exists."
              className="m-3 border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[var(--nx-text-muted)]">
                    {[
                      "Name",
                      "Type",
                      "Rows",
                      "Columns",
                      "Size",
                      "Quality",
                      "Created",
                      "Last analysed",
                      "",
                    ].map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((dataset) => (
                    <tr key={dataset.id} className="group hover:bg-[var(--nx-hover)]">
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <StatusDot status={dataset.status} />
                          <div className="min-w-0">
                            <Link
                              href={`/datasets/${dataset.id}`}
                              className="block truncate font-medium text-[var(--nx-text)] hover:text-[var(--nx-accent)]"
                            >
                              {dataset.name}
                            </Link>
                            {dataset.error_message ? (
                              <p className="truncate text-[10.5px] text-[var(--nx-error)]">
                                {dataset.error_message}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 uppercase text-[var(--nx-text-muted)]">
                        {dataset.file_type ?? "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-right font-mono">
                        {dataset.row_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-right font-mono">
                        {dataset.column_count ?? "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-right font-mono text-[var(--nx-text-muted)]">
                        {dataset.size_bytes ? formatBytes(dataset.size_bytes) : "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2">
                        <QualityBadge score={dataset.quality_score} />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-[var(--nx-text-muted)]">
                        {relativeTime(dataset.created_at)}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2 text-[var(--nx-text-muted)]">
                        {dataset.last_analyzed_at
                          ? relativeTime(dataset.last_analyzed_at)
                          : "Never"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-2">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {dataset.status === "ready" ? (
                            <Button asChild size="icon-sm" variant="ghost" title="Analyse">
                              <Link href={`/ask-ai?dataset=${dataset.id}`}>
                                <Sparkles className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            asChild
                            size="icon-sm"
                            variant="ghost"
                            title="Download original file"
                          >
                            <a href={`/api/datasets/${dataset.id}/download`}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Delete"
                            disabled={deletingId === dataset.id}
                            onClick={() => remove(dataset)}
                          >
                            {deletingId === dataset.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatusDot({ status }: { status: Dataset["status"] }) {
  if (status === "ready") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />;
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-[var(--nx-error)]" />;
  }
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--nx-warning)]" />;
}

export function QualityBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[var(--nx-text-muted)]">—</span>;
  const tone = score >= 85 ? "success" : score >= 65 ? "warning" : "error";
  return <Badge tone={tone}>{score}/100</Badge>;
}
