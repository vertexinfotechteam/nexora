import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listAnomalies } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Anomaly Detection" };
export const dynamic = "force-dynamic";

export default async function AnomaliesPage() {
  const session = await requireSession();
  const anomalies = await listAnomalies(session, 200);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">
          Anomaly Detection
        </h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Points that deviate from the level implied by their surrounding
          periods. Expected values are computed, not assumed.
        </p>
      </div>

      {anomalies.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-4 w-4" />}
          title="No anomalies detected"
          description="Anomaly detection runs automatically with every analysis on any dataset that has a date column and a numeric measure. Nothing has deviated far enough to be flagged."
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
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--nx-warning)]" />
              Detected anomalies
            </CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {anomalies.length} total
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[var(--nx-text-muted)]">
                    {[
                      "Metric",
                      "Date",
                      "Actual",
                      "Expected",
                      "Deviation",
                      "z-score",
                      "Direction",
                      "Severity",
                      "Confidence",
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
                      <td
                        className={`border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono ${
                          anomaly.direction === "spike"
                            ? "text-[var(--nx-success)]"
                            : "text-[var(--nx-error)]"
                        }`}
                      >
                        {anomaly.deviation_pct === null
                          ? "—"
                          : `${anomaly.deviation_pct > 0 ? "+" : ""}${anomaly.deviation_pct.toFixed(1)}%`}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono text-[var(--nx-text-muted)]">
                        {anomaly.z_score}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                        {anomaly.direction}
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
                          {anomaly.severity}
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
            <p className="border-t border-[var(--nx-border)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--nx-text-faint)]">
              Method: {anomalies[0].method}. Confidence is derived from the
              robust z-score and saturates below 100% — it is never asserted by
              a language model.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
