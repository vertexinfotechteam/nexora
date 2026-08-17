import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Database,
  Rows3,
  ShieldCheck,
  FileText,
  Lightbulb,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { accuracyLabel } from "@/lib/analysis/forecast";
import {
  listAnomalies,
  listDatasets,
  listForecasts,
  listJobs,
  listRecommendations,
  listReports,
} from "@/lib/store";
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
import { ChartView } from "@/components/charts/chart-view";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();

  const [datasets, anomalies, forecasts, recommendations, reports, jobs] =
    await Promise.all([
      listDatasets(session),
      listAnomalies(session, 8),
      listForecasts(session, 1),
      listRecommendations(session, 4),
      listReports(session, 5),
      listJobs(session, 5),
    ]);

  const ready = datasets.filter((d) => d.status === "ready");
  const totalRows = ready.reduce((sum, d) => sum + (d.row_count ?? 0), 0);
  const avgQuality =
    ready.length > 0
      ? ready.reduce((sum, d) => sum + (d.quality_score ?? 0), 0) / ready.length
      : null;
  const forecast = forecasts[0] ?? null;

  /* No data yet: show a real empty state, never fabricated analytics. */
  if (datasets.length === 0) {
    return (
      <div className="space-y-3">
        <Header />
        <EmptyState
          icon={<Database className="h-4 w-4" />}
          title="Connect a dataset to see your metrics"
          description="This dashboard only ever shows figures computed from your own data. Upload a CSV, XLSX, JSON or Parquet file and the overview fills in automatically."
          action={
            <Button asChild variant="accent">
              <Link href="/datasets">Upload your first dataset</Link>
            </Button>
          }
          className="py-20"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header />

      {/* Portfolio KPIs — counts of real objects, not invented business metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Datasets ready"
          value={String(ready.length)}
          sub={`${datasets.length} uploaded in total`}
          icon={Database}
        />
        <StatCard
          label="Rows available"
          value={formatNumber(totalRows)}
          sub="across all ready datasets"
          icon={Rows3}
        />
        <StatCard
          label="Average data quality"
          value={avgQuality === null ? "—" : `${avgQuality.toFixed(1)}/100`}
          sub="measured, not estimated"
          icon={ShieldCheck}
        />
        <StatCard
          label="Analyses run"
          value={String(jobs.length)}
          sub={jobs[0] ? `last ${relativeTime(jobs[0].created_at)}` : "none yet"}
          icon={Activity}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          {/* Forecast / trend */}
          {forecast ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--nx-cyan)]" />
                  {forecast.metric} — history and projection
                </CardTitle>
                {/* Never render this as a bare "error NN%" — the badge
                    uppercases, which reads as a failure state. */}
                <Badge tone={forecast.accuracy_basis === "backtest" ? "success" : "warning"}>
                  {forecast.mape !== null
                    ? `${accuracyLabel(forecast.accuracy_basis)} ${forecast.mape}%`
                    : "no accuracy measure"}
                </Badge>
              </CardHeader>
              <CardBody className="p-2">
                <ChartView
                  spec={{
                    type: "line",
                    title: forecast.metric,
                    xKey: "period",
                    yKeys: ["actual", "forecast"],
                    reason: "",
                  }}
                  rows={[
                    ...forecast.history.map((p) => ({
                      period: p.period,
                      actual: p.value,
                      forecast: null,
                    })),
                    ...forecast.points.map((p) => ({
                      period: p.period,
                      actual: null,
                      forecast: p.value,
                    })),
                  ]}
                  height={230}
                />
                <p className="px-2 pt-1 text-[10.5px] text-[var(--nx-text-faint)]">
                  {forecast.model}
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Trend and forecast</CardTitle>
              </CardHeader>
              <CardBody>
                <EmptyState
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="No forecast yet"
                  description="Run an analysis on a dataset that has a date column and a numeric measure. A forecast is fitted automatically and appears here."
                  action={
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/ask-ai">Run an analysis</Link>
                    </Button>
                  }
                  className="border-0"
                />
              </CardBody>
            </Card>
          )}

          {/* Recent anomalies */}
          <Card>
            <CardHeader>
              <CardTitle>
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--nx-warning)]" />
                Recent anomalies
              </CardTitle>
              <Link
                href="/anomalies"
                className="text-[11px] text-[var(--nx-accent)] hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {anomalies.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">
                  Nothing has deviated far enough from its expected level to be
                  flagged.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-[var(--nx-text-muted)]">
                        {["Metric", "Date", "Actual", "Expected", "Severity", "Confidence"].map(
                          (header) => (
                            <th
                              key={header}
                              className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide"
                            >
                              {header}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.map((anomaly) => (
                        <tr key={anomaly.id} className="hover:bg-[var(--nx-hover)]">
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                            {anomaly.metric}
                          </td>
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                            {anomaly.occurred_on}
                          </td>
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                            {formatNumber(anomaly.actual_value)}
                          </td>
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono text-[var(--nx-text-muted)]">
                            {formatNumber(anomaly.expected_value)}
                          </td>
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                            <Badge
                              tone={
                                anomaly.severity === "critical" || anomaly.severity === "high"
                                  ? "error"
                                  : anomaly.severity === "medium"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {anomaly.severity} {anomaly.direction === "spike" ? "↑" : "↓"}
                            </Badge>
                          </td>
                          <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                            {anomaly.confidence}%
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

        {/* Right rail */}
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>
                <Lightbulb className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
                AI insight
              </CardTitle>
              {recommendations[0]?.impact ? (
                <Badge
                  tone={recommendations[0].impact === "High" ? "error" : "warning"}
                >
                  {recommendations[0].impact} impact
                </Badge>
              ) : null}
            </CardHeader>
            <CardBody className="p-3">
              {recommendations.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                  Insights appear after your first analysis. Every one is derived
                  from a measured figure and shows the evidence behind it.
                </p>
              ) : (
                <div className="space-y-3">
                  {recommendations.slice(0, 2).map((recommendation) => (
                    <div key={recommendation.id}>
                      <p className="text-[13px] font-medium leading-snug text-[var(--nx-text)]">
                        {recommendation.title}
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                        {recommendation.body}
                      </p>
                      <div className="mt-2 space-y-1">
                        {recommendation.evidence.slice(0, 4).map((item, index) => (
                          <div
                            key={index}
                            className="flex items-baseline justify-between gap-2 border-b border-[var(--nx-border-subtle)] pb-1"
                          >
                            <span className="truncate text-[11px] text-[var(--nx-text-muted)]">
                              {item.label}
                            </span>
                            <span className="shrink-0 font-mono text-[11px]">
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button asChild size="sm" variant="secondary" className="w-full">
                    <Link href="/recommendations">View full analysis</Link>
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Database className="h-3.5 w-3.5" />
                Datasets
              </CardTitle>
              <Link
                href="/datasets"
                className="text-[11px] text-[var(--nx-accent)] hover:underline"
              >
                Manage
              </Link>
            </CardHeader>
            <CardBody className="space-y-1.5 p-3">
              {datasets.slice(0, 6).map((dataset) => (
                <Link
                  key={dataset.id}
                  href={`/datasets/${dataset.id}`}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-[var(--nx-border-subtle)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {dataset.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                    {dataset.row_count?.toLocaleString() ?? "—"}
                  </span>
                  <QualityBadge score={dataset.quality_score} />
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <FileText className="h-3.5 w-3.5" />
                Recent reports
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 p-3">
              {reports.length === 0 ? (
                <p className="text-[12px] text-[var(--nx-text-muted)]">
                  Reports are created automatically each time you run an analysis.
                </p>
              ) : (
                reports.map((report) => (
                  <a
                    key={report.id}
                    href={`/api/reports/${report.id}/pdf`}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-[var(--nx-border-subtle)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {report.title}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-[var(--nx-text-muted)]">
                      {relativeTime(report.created_at)}
                    </span>
                  </a>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-[15px] font-semibold tracking-tight">Overview</h1>
      <p className="text-[12px] text-[var(--nx-text-muted)]">
        Everything here is computed from your data.
      </p>
      <Button asChild variant="accent" size="sm" className="ml-auto">
        <Link href="/ask-ai">
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </Link>
      </Button>
    </div>
  );
}

/**
 * A headline count.
 *
 * Laid out to the reference: an icon tile, the label beside it, the figure
 * large underneath.
 *
 * The reference also carries a percentage delta and a sparkline on each card.
 * Neither appears here, and deliberately so — these four are counts of things
 * that exist right now (files, rows, a quality score, analyses run), not a
 * series measured over time. There is no previous period to compare against
 * and no history to draw, so a trend line would be decoration in the shape of
 * evidence. Charts on this page are drawn from real series instead.
 */
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    /*
     * Proportions follow the reference: a rounded icon tile, the label beside
     * it, the figure dominant beneath, and a quiet line of context under that.
     *
     * The reference also puts a percentage delta and a sparkline on each card.
     * Neither is here, because neither exists for these figures — they are
     * counts of datasets, rows and analyses, with no prior period to compare
     * against and no series to draw. Inventing either would put a number on
     * screen that nothing computed, which is the one thing this product
     * promises it will never do.
     */
    <Card className="transition-colors hover:bg-[var(--nx-elevated)]">
      <CardBody className="p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--nx-accent-soft-strong)]">
            <Icon className="h-4 w-4 text-[var(--nx-accent)]" />
          </span>
          <p className="text-[12.5px] font-medium text-[var(--nx-text-muted)]">
            {label}
          </p>
        </div>
        <p className="mt-4 text-[30px] font-semibold leading-none tracking-tight text-[var(--nx-text)]">
          {value}
        </p>
        <p className="mt-2.5 text-[11px] leading-snug text-[var(--nx-text-faint)]">
          {sub}
        </p>
      </CardBody>
    </Card>
  );
}
