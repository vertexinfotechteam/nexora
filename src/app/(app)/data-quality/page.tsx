import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listDatasetProfiles, listDatasets } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { QualityBadge } from "@/components/datasets/dataset-manager";

export const metadata: Metadata = { title: "Data Quality" };
export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const session = await requireSession();
  const datasets = await listDatasets(session);

  const withIssues = await Promise.all(
    datasets
      .filter((dataset) => dataset.status === "ready")
      .map(async (dataset) => {
        const profiles = await listDatasetProfiles(session, dataset.id);
        const issues = profiles
          .flatMap((profile) =>
            profile.issues.map((issue) => ({
              ...issue,
              column: profile.column_name,
            })),
          )
          .sort((a, b) => {
            const rank = { high: 0, medium: 1, low: 2 };
            return rank[a.severity] - rank[b.severity] || b.affected - a.affected;
          });
        return { dataset, issues };
      }),
  );

  if (withIssues.length === 0) {
    return (
      <div className="space-y-3">
        <Header />
        <EmptyState
          icon={<ShieldCheck className="h-4 w-4" />}
          title="No datasets to check"
          description="Every dataset is profiled on upload. Missing values, duplicates, outliers, empty and constant columns are all counted directly."
          action={
            <Button asChild variant="accent">
              <Link href="/datasets">Upload a dataset</Link>
            </Button>
          }
          className="py-16"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header />
      {withIssues.map(({ dataset, issues }) => (
        <Card key={dataset.id}>
          <CardHeader>
            <CardTitle>
              <Link
                href={`/datasets/${dataset.id}`}
                className="hover:text-[var(--nx-accent)]"
              >
                {dataset.name}
              </Link>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-[var(--nx-text-faint)]">
                {(dataset.row_count ?? 0).toLocaleString()} rows ·{" "}
                {dataset.column_count ?? 0} columns
              </span>
              <QualityBadge score={dataset.quality_score} />
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {issues.length === 0 ? (
              <p className="px-4 py-4 text-[12px] text-[var(--nx-success)]">
                No quality issues were detected in this dataset.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--nx-border-subtle)]">
                {issues.slice(0, 15).map((issue, index) => (
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
                      {issue.code.replace(/_/g, " ")}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium">{issue.column}</p>
                      <p className="text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                        {issue.detail}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--nx-text-muted)]">
                      {issue.affected.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-[15px] font-semibold tracking-tight">Data Quality</h1>
      <p className="text-[12px] text-[var(--nx-text-muted)]">
        Scores are calculated from measured completeness, uniqueness, structure
        and outlier rate — never estimated.
      </p>
    </div>
  );
}
