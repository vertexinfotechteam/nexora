import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listReports } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  const reports = await listReports(session, 100);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Reports</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          A report is written automatically for every analysis. Download it as a
          PDF with charts, anomalies, forecast, recommendations and the full
          method trail.
        </p>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No reports yet"
          description="Run an analysis and a full report is generated from its verified results."
          action={
            <Button asChild variant="accent">
              <Link href="/ask-ai">Run an analysis</Link>
            </Button>
          }
          className="py-16"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <FileText className="h-3.5 w-3.5" />
              Generated reports
            </CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {reports.length} total
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--nx-border-subtle)]">
              {reports.map((report) => {
                const payload = report.payload;
                return (
                  <li
                    key={report.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-[var(--nx-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {report.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-[var(--nx-text-muted)]">
                        {payload.question}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {payload.charts.length > 0 ? (
                        <Badge tone="neutral">{payload.charts.length} charts</Badge>
                      ) : null}
                      {payload.anomalies.length > 0 ? (
                        <Badge tone="warning">
                          {payload.anomalies.length} anomalies
                        </Badge>
                      ) : null}
                      {payload.forecasts.length > 0 ? (
                        <Badge tone="cyan">forecast</Badge>
                      ) : null}
                      {payload.provider ? (
                        <Badge tone="purple">{payload.provider}</Badge>
                      ) : (
                        <Badge tone="neutral">statistical</Badge>
                      )}
                    </div>

                    <span className="shrink-0 text-[10.5px] text-[var(--nx-text-faint)]">
                      {report.period_start && report.period_end
                        ? `${report.period_start} → ${report.period_end}`
                        : "full dataset"}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-[var(--nx-text-faint)]">
                      {relativeTime(report.created_at)}
                    </span>

                    <div className="flex shrink-0 gap-1.5">
                      <Button asChild size="sm" variant="secondary">
                        <a href={`/api/reports/${report.id}/pdf`}>
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <a href={`/api/reports/${report.id}/excel`}>
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Excel
                        </a>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
