"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUp,
  BadgeCheck,
  Database,
  Download,
  FileSpreadsheet,
  Lightbulb,
  Loader2,
  ShieldAlert,
  Sparkles,
  Square,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionLabel,
} from "@/components/ui/primitives";
import { ActivityStream } from "./activity-stream";
import { ChartView, ResultTable } from "@/components/charts/chart-view";
import { cn, formatDuration, formatNumber } from "@/lib/utils";
import type {
  ActivityStep,
  AnalysisResult,
  Anomaly,
  Dataset,
  DatasetQuality,
  Forecast,
  Recommendation,
} from "@/lib/store/types";

type Kpi = {
  label: string;
  formatted: string;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  positiveIsGood: boolean;
  sparkline: { period: string; value: number }[];
};

type AnalysisPayload = {
  jobId: string;
  reportId: string;
  narrative: string;
  narrativeSource: "ai" | "verified-fallback" | "deterministic";
  unverifiedClaims: string[];
  provider: string | null;
  model: string | null;
  figures: { label: string; value: string }[];
  results: AnalysisResult[];
  kpis: Kpi[];
  anomalies: Anomaly[];
  forecasts: Forecast[];
  recommendations: Recommendation[];
  quality: DatasetQuality | null;
  durationMs: number;
};

const EXAMPLES = [
  "Which product generated the highest revenue?",
  "Show monthly revenue.",
  "Why did revenue decline?",
  "Which category is growing fastest?",
  "Find unusual transactions.",
  "Compare this quarter with last quarter.",
  "Forecast the next 3 months.",
  "Create a sales dashboard.",
];

/**
 * Query parameters are resolved on the server and passed in as props rather
 * than read with useSearchParams(), which would force this whole subtree to be
 * a separately-streamed Suspense boundary.
 */
export function AskAi({
  datasets,
  initialQuestion = "",
  initialDatasetId = "",
}: {
  datasets: Dataset[];
  initialQuestion?: string;
  initialDatasetId?: string;
}) {
  const router = useRouter();

  const readyDatasets = datasets.filter((d) => d.status === "ready");
  const [datasetId, setDatasetId] = useState(
    readyDatasets.find((d) => d.id === initialDatasetId)?.id ??
      readyDatasets[0]?.id ??
      "",
  );
  const [question, setQuestion] = useState(initialQuestion);
  const [steps, setSteps] = useState<ActivityStep[]>([]);
  const [running, setRunning] = useState(false);
  const [payload, setPayload] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !datasetId || running) return;

      setRunning(true);
      setSteps([]);
      setPayload(null);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/analysis/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ datasetId, question: trimmed }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => ({}));
          if (body.code === "out_of_credits") {
            setOutOfCredits(true);
          }
          throw new Error(body.error ?? `The analysis could not start (${response.status}).`);
        }

        // Server-Sent Events over a POST response body.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            if (chunk.startsWith(":")) continue; // heartbeat

            const eventLine = chunk.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6));

            if (event === "step") {
              setSteps((previous) => {
                const index = previous.findIndex((s) => s.id === data.id);
                if (index >= 0) {
                  const next = [...previous];
                  next[index] = data;
                  return next;
                }
                return [...previous, data];
              });
            } else if (event === "result") {
              setPayload(data);
            } else if (event === "error") {
              setError(data.message);
            }
          }
        }
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError((caught as Error).message);
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
        router.refresh();
      }
    },
    [datasetId, running, router],
  );

  if (readyDatasets.length === 0) {
    return (
      <EmptyState
        icon={<Database className="h-4 w-4" />}
        title="No dataset is ready to analyse"
        description="Upload a CSV, XLSX, JSON or Parquet file first. Nothing on this page is simulated — the analysis runs against your real data."
        action={
          <Button asChild variant="accent">
            <Link href="/datasets">Upload a dataset</Link>
          </Button>
        }
        className="py-16"
      />
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0 space-y-3">
        <Card>
          <CardBody className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-[var(--nx-text-muted)]">
                Dataset
              </label>
              <select
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                disabled={running}
                className="h-7 rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2 text-[12px] text-[var(--nx-text)] outline-none focus:border-[var(--nx-purple)]"
              >
                {readyDatasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({(dataset.row_count ?? 0).toLocaleString()} rows)
                  </option>
                ))}
              </select>
              {readyDatasets.find((d) => d.id === datasetId)?.quality_score !== null ? (
                <Badge tone="neutral">
                  Quality{" "}
                  {readyDatasets.find((d) => d.id === datasetId)?.quality_score}/100
                </Badge>
              ) : null}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(question);
              }}
              className="relative"
            >
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    run(question);
                  }
                }}
                rows={3}
                disabled={running}
                placeholder="Ask anything about your data..."
                className="w-full resize-none rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2.5 pr-11 text-[13px] leading-relaxed text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)]"
              />
              <div className="absolute bottom-2 right-2">
                {running ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    onClick={() => abortRef.current?.abort()}
                    title="Stop"
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="accent"
                    disabled={!question.trim()}
                    title="Run analysis"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </form>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={running}
                  onClick={() => {
                    setQuestion(example);
                    run(example);
                  }}
                  className="rounded border border-[var(--nx-border)] bg-[var(--nx-hover)] px-2 py-1 text-[11px] text-[var(--nx-text-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-text)] disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {error ? (
          <Card
            className={
              outOfCredits
                ? "border-[var(--nx-accent-border)]"
                : "border-[var(--nx-error-border)]"
            }
          >
            <CardBody className="flex items-start gap-2 p-3 text-[12.5px]">
              {outOfCredits ? (
                <Zap className="mt-px h-4 w-4 shrink-0 text-[var(--nx-accent)]" />
              ) : (
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--nx-error)]" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-medium",
                    outOfCredits
                      ? "text-[var(--nx-accent-fg-on-soft)]"
                      : "text-[var(--nx-error-fg)]",
                  )}
                >
                  {outOfCredits
                    ? "You are out of credits"
                    : "The analysis stopped"}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                  {error}
                  {outOfCredits
                    ? " Everything you have already analysed stays available, and re-downloading reports is always free."
                    : ""}
                </p>
                {outOfCredits ? (
                  <Button asChild size="sm" variant="accent" className="mt-2">
                    <Link href="/#pricing">See plans</Link>
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {payload ? <AnalysisResults payload={payload} /> : null}

        {!payload && !running && steps.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-4 w-4" />}
            title="Ask a question to start"
            description="Every figure in the answer is computed by the analytics engine from your data. Anything the AI cannot back with a computation is rejected before you see it."
            className="py-12"
          />
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0 space-y-3">
        <Card className="xl:sticky xl:top-[58px]">
          <CardHeader>
            <CardTitle>
              <Sparkles className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
              Live activity
            </CardTitle>
            {payload ? (
              <span className="font-mono text-[10px] text-[var(--nx-text-faint)]">
                {formatDuration(payload.durationMs)}
              </span>
            ) : null}
          </CardHeader>
          <CardBody className="p-3">
            <ActivityStream steps={steps} running={running} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AnalysisResults({ payload }: { payload: AnalysisPayload }) {
  const [downloading, setDownloading] = useState<"pdf" | "excel" | null>(null);

  const charts = payload.results.filter((r) => r.chart && r.rows?.length);
  const tables = payload.results.filter((r) => !r.chart && r.rows?.length);

  const download = async (format: "pdf" | "excel") => {
    setDownloading(format);
    try {
      const response = await fetch(`/api/reports/${payload.reportId}/${format}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The report could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexora-report-${payload.reportId.slice(0, 8)}.${
        format === "pdf" ? "pdf" : "xlsx"
      }`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Answer */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Sparkles className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
            Answer
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <NarrativeBadge payload={payload} />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => download("pdf")}
              disabled={downloading !== null}
            >
              {downloading === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => download("excel")}
              disabled={downloading !== null}
            >
              {downloading === "excel" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              Excel
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-[var(--nx-text)]">
            {payload.narrative}
          </p>

          {payload.unverifiedClaims.length > 0 ? (
            <div className="flex items-start gap-2 rounded border border-[var(--nx-accent-border)] bg-[var(--nx-accent-soft)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--nx-warning-fg)]">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                The AI&apos;s original wording contained{" "}
                {payload.unverifiedClaims.length} figure
                {payload.unverifiedClaims.length === 1 ? "" : "s"} (
                {payload.unverifiedClaims.join(", ")}) that did not match any
                computation, so it was replaced with a summary built only from
                verified values.
              </span>
            </div>
          ) : null}

          {payload.figures.length > 0 ? (
            <div>
              <SectionLabel className="mb-1.5">Verified figures</SectionLabel>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {payload.figures.slice(0, 12).map((figure, index) => (
                  <div
                    key={`${figure.label}-${index}`}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--nx-border-subtle)] py-1"
                  >
                    <span className="truncate text-[11.5px] text-[var(--nx-text-muted)]">
                      {figure.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-[var(--nx-text)]">
                      {figure.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* KPIs */}
      {payload.kpis.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {payload.kpis.map((kpi) => (
            <KpiCard key={kpi.label} kpi={kpi} />
          ))}
        </div>
      ) : null}

      {/* Charts */}
      {charts.map((result) => (
        <Card key={result.id}>
          <CardHeader>
            <CardTitle>{result.title ?? result.chart!.title}</CardTitle>
            <Badge tone="neutral">{result.chart!.type}</Badge>
          </CardHeader>
          <CardBody className="p-2">
            <ChartView spec={result.chart!} rows={result.rows!} />
            <p className="px-2 pt-1 text-[10.5px] text-[var(--nx-text-faint)]">
              {result.chart!.reason}
            </p>
          </CardBody>
        </Card>
      ))}

      {/* Tables */}
      {tables.map((result) => (
        <Card key={result.id}>
          <CardHeader>
            <CardTitle>{result.title}</CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {(result.row_count ?? 0).toLocaleString()} rows
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ResultTable
              columns={(result.columns ?? []).map((c) => c.name)}
              rows={result.rows ?? []}
              maxRows={50}
            />
          </CardBody>
        </Card>
      ))}

      {/* Anomalies */}
      {payload.anomalies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--nx-warning)]" />
              Anomalies detected
            </CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {payload.anomalies[0].method}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[var(--nx-text-muted)]">
                    {["Date", "Metric", "Actual", "Expected", "Deviation", "Severity", "Confidence"].map(
                      (header) => (
                        <th
                          key={header}
                          className="whitespace-nowrap border-b border-[var(--nx-border)] px-2.5 py-1.5 text-left font-semibold"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {payload.anomalies.slice(0, 12).map((anomaly) => (
                    <tr key={anomaly.id} className="hover:bg-[var(--nx-hover)]">
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5">
                        {anomaly.occurred_on}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5">
                        {anomaly.metric}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5 text-right font-mono">
                        {formatNumber(anomaly.actual_value)}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5 text-right font-mono text-[var(--nx-text-muted)]">
                        {formatNumber(anomaly.expected_value)}
                      </td>
                      <td
                        className={cn(
                          "border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5 text-right font-mono",
                          anomaly.direction === "spike"
                            ? "text-[var(--nx-success)]"
                            : "text-[var(--nx-error)]",
                        )}
                      >
                        {anomaly.deviation_pct === null
                          ? "—"
                          : `${anomaly.deviation_pct > 0 ? "+" : ""}${anomaly.deviation_pct.toFixed(1)}%`}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5">
                        <Badge
                          tone={
                            anomaly.severity === "critical" || anomaly.severity === "high"
                              ? "error"
                              : anomaly.severity === "medium"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {anomaly.severity}
                        </Badge>
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2.5 py-1.5 text-right font-mono">
                        {anomaly.confidence}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Forecast */}
      {payload.forecasts.map((forecast) => (
        <ForecastCard key={forecast.id} forecast={forecast} />
      ))}

      {/* Recommendations */}
      {payload.recommendations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <Lightbulb className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2.5 p-3">
            {payload.recommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] p-2.5"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-medium text-[var(--nx-text)]">
                    {recommendation.title}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    {recommendation.impact ? (
                      <Badge
                        tone={recommendation.impact === "High" ? "error" : "warning"}
                      >
                        {recommendation.impact} impact
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                  {recommendation.body}
                </p>
                {recommendation.evidence.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recommendation.evidence.map((item, index) => (
                      <span
                        key={index}
                        className="rounded bg-[var(--nx-border-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--nx-text-muted)]"
                      >
                        {item.label}:{" "}
                        <span className="font-mono text-[var(--nx-text)]">
                          {item.value}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function NarrativeBadge({ payload }: { payload: AnalysisPayload }) {
  if (payload.narrativeSource === "ai") {
    return (
      <Badge tone="success" title={`${payload.provider} · ${payload.model}`}>
        <BadgeCheck className="h-3 w-3" />
        All figures verified
      </Badge>
    );
  }
  if (payload.narrativeSource === "verified-fallback") {
    return (
      <Badge tone="warning">
        <ShieldAlert className="h-3 w-3" />
        Rebuilt from verified values
      </Badge>
    );
  }
  return <Badge tone="neutral">Computed summary</Badge>;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const good =
    kpi.changePct === null
      ? null
      : kpi.positiveIsGood
        ? kpi.changePct > 0
        : kpi.changePct < 0;

  return (
    <Card>
      <CardBody className="p-3">
        <p className="truncate text-[11px] text-[var(--nx-text-muted)]">
          {kpi.label}
        </p>
        <p className="mt-1 text-[19px] font-semibold leading-none tracking-tight">
          {kpi.formatted}
        </p>
        {kpi.changePct !== null ? (
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[11px]",
              good === null
                ? "text-[var(--nx-text-muted)]"
                : good
                  ? "text-[var(--nx-success)]"
                  : "text-[var(--nx-error)]",
            )}
          >
            <TrendingUp
              className={cn("h-3 w-3", kpi.direction === "down" && "rotate-180")}
            />
            {kpi.changePct > 0 ? "+" : ""}
            {kpi.changePct.toFixed(1)}% vs previous period
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-[var(--nx-text-faint)]">
            No previous period to compare
          </p>
        )}
        {kpi.sparkline.length > 2 ? (
          <div className="mt-2 h-8">
            <ChartView
              spec={{
                type: "line",
                title: kpi.label,
                xKey: "period",
                yKeys: ["value"],
                reason: "",
              }}
              rows={kpi.sparkline}
              height={32}
            />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ForecastCard({ forecast }: { forecast: Forecast }) {
  // History and projection share one series so the chart reads continuously.
  const rows = [
    ...forecast.history.map((point) => ({
      period: point.period,
      actual: point.value,
      forecast: null as number | null,
    })),
    ...forecast.points.map((point) => ({
      period: point.period,
      actual: null as number | null,
      forecast: point.value,
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TrendingUp className="h-3.5 w-3.5 text-[var(--nx-cyan)]" />
          {forecast.metric} forecast
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {forecast.mape !== null ? (
            <Badge tone="neutral">Backtest error {forecast.mape}%</Badge>
          ) : null}
          <Badge tone="cyan">{forecast.horizon} periods</Badge>
        </div>
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
          rows={rows}
          height={220}
        />
        <div className="space-y-1 px-2 pt-1.5">
          <p className="text-[10.5px] text-[var(--nx-text-faint)]">Model: {forecast.model}</p>
          {forecast.data_quality_note ? (
            <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[var(--nx-warning)]">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              {forecast.data_quality_note}
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
