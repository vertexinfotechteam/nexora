import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listForecasts } from "@/lib/store";
import { accuracyLabel } from "@/lib/analysis/forecast";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { ChartView } from "@/components/charts/chart-view";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Forecasting" };
export const dynamic = "force-dynamic";

export default async function ForecastingPage() {
  const session = await requireSession();
  const forecasts = await listForecasts(session, 20);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Forecasting</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Statistical projections with confidence intervals. No forecast number
          is ever produced by a language model.
        </p>
      </div>

      {forecasts.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-4 w-4" />}
          title="No forecasts yet"
          description="A forecast is fitted automatically whenever you analyse a dataset that has a date column and at least four periods of history."
          action={
            <Button asChild variant="accent">
              <Link href="/ask-ai">Run an analysis</Link>
            </Button>
          }
          className="py-16"
        />
      ) : (
        forecasts.map((forecast) => (
          <Card key={forecast.id}>
            <CardHeader>
              <CardTitle>
                <TrendingUp className="h-3.5 w-3.5 text-[var(--nx-cyan)]" />
                {forecast.metric} — next {forecast.horizon} {forecast.granularity}
                {forecast.horizon === 1 ? "" : "s"}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {forecast.mape !== null ? (
                  <Badge tone={forecast.accuracy_basis === "backtest" ? "success" : "warning"}>
                    {accuracyLabel(forecast.accuracy_basis)} {forecast.mape}%
                  </Badge>
                ) : null}
                <span className="text-[10.5px] text-[var(--nx-text-faint)]">
                  {relativeTime(forecast.created_at)}
                </span>
              </div>
            </CardHeader>
            <CardBody className="p-2">
              <ChartView
                spec={{
                  type: "line",
                  title: forecast.metric,
                  xKey: "period",
                  yKeys: ["actual", "forecast", "lower", "upper"],
                  reason: "",
                }}
                rows={[
                  ...forecast.history.map((point) => ({
                    period: point.period,
                    actual: point.value,
                    forecast: null,
                    lower: null,
                    upper: null,
                  })),
                  ...forecast.points.map((point) => ({
                    period: point.period,
                    actual: null,
                    forecast: point.value,
                    lower: point.lower,
                    upper: point.upper,
                  })),
                ]}
                height={250}
              />

              <div className="mt-2 grid gap-3 px-2 lg:grid-cols-[1fr_320px]">
                <div className="space-y-1 text-[10.5px] text-[var(--nx-text-faint)]">
                  <p>Model: {forecast.model}</p>
                  <p>
                    History: {forecast.history.length} periods
                    {forecast.mape !== null
                      ? ` · ${accuracyLabel(forecast.accuracy_basis).toLowerCase()} ${forecast.mape}%`
                      : ""}
                  </p>
                  {forecast.data_quality_note ? (
                    <p className="flex items-start gap-1.5 leading-relaxed text-[var(--nx-warning)]">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      {forecast.data_quality_note}
                    </p>
                  ) : null}
                </div>

                <table className="text-[11px]">
                  <thead>
                    <tr className="text-[var(--nx-text-muted)]">
                      <th className="border-b border-[var(--nx-border)] py-1 text-left font-semibold">
                        Period
                      </th>
                      <th className="border-b border-[var(--nx-border)] py-1 text-right font-semibold">
                        Projected
                      </th>
                      <th className="border-b border-[var(--nx-border)] py-1 text-right font-semibold">
                        Range
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.points.map((point) => (
                      <tr key={point.period}>
                        <td className="border-b border-[var(--nx-border-subtle)] py-1">
                          {point.period}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] py-1 text-right font-mono">
                          {formatNumber(point.value)}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] py-1 text-right font-mono text-[var(--nx-text-muted)]">
                          {formatNumber(point.lower)} – {formatNumber(point.upper)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
