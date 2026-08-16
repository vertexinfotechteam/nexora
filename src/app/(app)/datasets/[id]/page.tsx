import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, Sparkles, Table2 } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getDataset, listDatasetColumns, listDatasetProfiles } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { QualityBadge } from "@/components/datasets/dataset-manager";
import { DatasetPreview } from "@/components/datasets/dataset-preview";
import { formatBytes, formatNumber, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/datasets/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const session = await requireSession();
  const dataset = await getDataset(session, id);
  return { title: dataset?.name ?? "Dataset" };
}

export default async function DatasetDetailPage(
  props: PageProps<"/datasets/[id]">,
) {
  const { id } = await props.params;
  const session = await requireSession();

  const dataset = await getDataset(session, id);
  if (!dataset) notFound();

  const [columns, profiles] = await Promise.all([
    listDatasetColumns(session, id),
    listDatasetProfiles(session, id),
  ]);
  const profileByName = new Map(profiles.map((p) => [p.column_name, p]));

  const allIssues = profiles
    .flatMap((profile) =>
      profile.issues.map((issue) => ({ ...issue, column: profile.column_name })),
    )
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity] || b.affected - a.affected;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/datasets"
          className="text-[11.5px] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]"
        >
          Sources
        </Link>
        <span className="text-[11.5px] text-[var(--nx-border-strong)]">/</span>
        <h1 className="text-[15px] font-semibold tracking-tight">
          {dataset.name}
        </h1>
        <QualityBadge score={dataset.quality_score} />
        <Button asChild variant="accent" size="sm" className="ml-auto">
          <Link href={`/ask-ai?dataset=${dataset.id}`}>
            <Sparkles className="h-3.5 w-3.5" />
            Analyse
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Rows" value={formatNumber(dataset.row_count ?? 0)} />
        <Stat label="Columns" value={String(dataset.column_count ?? 0)} />
        <Stat
          label="File size"
          value={dataset.size_bytes ? formatBytes(dataset.size_bytes) : "—"}
        />
        <Stat label="Type" value={(dataset.file_type ?? "—").toUpperCase()} />
        <Stat
          label="Last analysed"
          value={
            dataset.last_analyzed_at
              ? relativeTime(dataset.last_analyzed_at)
              : "Never"
          }
        />
      </div>

      {/* Quality issues */}
      {allIssues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Data quality findings</CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {allIssues.length} detected
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--nx-border-subtle)]">
              {allIssues.slice(0, 12).map((issue, index) => (
                <li key={index} className="flex items-start gap-2.5 px-4 py-2">
                  <Badge
                    tone={
                      issue.severity === "high"
                        ? "error"
                        : issue.severity === "medium"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {issue.severity}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium">{issue.column}</p>
                    <p className="text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                      {issue.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* Schema and profile */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Database className="h-3.5 w-3.5" />
            Columns
          </CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[var(--nx-text-muted)]">
                  {[
                    "Column",
                    "Type",
                    "Role",
                    "Missing",
                    "Distinct",
                    "Min",
                    "Max",
                    "Mean",
                    "Median",
                    "Outliers",
                  ].map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columns.map((column) => {
                  const profile = profileByName.get(column.name);
                  return (
                    <tr key={column.id} className="hover:bg-[var(--nx-hover)]">
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-medium">
                        {column.name}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                        {column.data_type}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                        <Badge
                          tone={
                            column.semantic_type === "measure"
                              ? "cyan"
                              : column.semantic_type === "date"
                                ? "purple"
                                : "neutral"
                          }
                        >
                          {column.semantic_type}
                        </Badge>
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                        {profile ? profile.null_count.toLocaleString() : "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                        {profile?.distinct_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                        {profile?.min_value ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                        {profile?.max_value ?? "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                        {profile?.mean_value !== null && profile?.mean_value !== undefined
                          ? formatNumber(profile.mean_value)
                          : "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                        {profile?.median_value !== null && profile?.median_value !== undefined
                          ? formatNumber(profile.median_value)
                          : "—"}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                        {profile?.outlier_count?.toLocaleString() ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Table2 className="h-3.5 w-3.5" />
            Data preview
          </CardTitle>
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            paginated — the full table is never sent to the browser
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {dataset.status === "ready" ? (
            <DatasetPreview datasetId={dataset.id} />
          ) : (
            <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">
              {dataset.error_message ??
                `This dataset is ${dataset.status}. Preview is available once it is ready.`}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="p-3">
        <p className="text-[11px] text-[var(--nx-text-muted)]">{label}</p>
        <p className="mt-1 text-[16px] font-semibold leading-none tracking-tight">
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
