"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pause, Play, RefreshCw } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { cn, relativeTime } from "@/lib/utils";
import type { AdminSnapshot } from "@/lib/admin";

/**
 * Live half of the admin panel.
 *
 * Polls the snapshot endpoint on an interval so an operator can leave the page
 * open and watch real traffic arrive. The data is the same server-computed
 * snapshot the page rendered with — nothing is simulated to make the feed look
 * busier than it is.
 */

const ACTION_TONE: Record<
  string,
  "success" | "warning" | "error" | "purple" | "cyan" | "neutral"
> = {
  "auth.login": "success",
  "auth.signup": "success",
  "auth.logout": "neutral",
  "auth.login_failed": "error",
  "auth.signup_failed": "error",
  "auth.local_session_started": "neutral",
  "auth.password_changed": "warning",
  "auth.password_reset_requested": "warning",
  "dataset.uploaded": "purple",
  "dataset.deleted": "error",
  "dataset.downloaded": "warning",
  "analysis.completed": "success",
  "analysis.failed": "error",
  "report.exported": "cyan",
  "workspace.created": "success",
  "branding.updated": "purple",
};

const REFRESH_MS = 8000;

export function AdminLivePanel({ initial }: { initial: AdminSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(`Snapshot failed (${response.status})`);
      const data = (await response.json()) as AdminSnapshot;
      if (mounted.current) {
        setSnapshot(data);
        setError(null);
      }
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, refresh]);

  const maxThroughput = Math.max(
    1,
    ...snapshot.throughput.map((h) => h.analyses + h.failures),
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_400px]">
      {/* Throughput */}
      <Card>
        <CardHeader>
          <CardTitle>Analyses over the last 24 hours</CardTitle>
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            peak {maxThroughput} per hour
          </span>
        </CardHeader>
        <CardBody className="p-2">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart
              data={snapshot.throughput}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid stroke="var(--nx-grid)" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: "var(--nx-text-faint)", fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "var(--nx-border)" }}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                width={30}
                tick={{ fill: "var(--nx-text-faint)", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--nx-cursor)" }}
                contentStyle={{
                  background: "var(--nx-inset)",
                  border: "1px solid var(--nx-border)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--nx-text)",
                }}
                labelStyle={{ color: "var(--nx-text-muted)" }}
              />
              <Bar
                dataKey="analyses"
                stackId="a"
                fill="var(--nx-series-6)"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="failures"
                stackId="a"
                fill="var(--nx-series-5)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="px-2 pb-1 text-[10.5px] text-[var(--nx-text-faint)]">
            Green is completed analyses, red is failures. Counted from the audit
            log, bucketed by hour.
          </p>
        </CardBody>
      </Card>

      {/* Live activity feed */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "bg-[var(--nx-success)] nx-live-dot" : "bg-[var(--nx-text-faint)]",
              )}
            />
            Real-time activity
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              title={live ? "Pause live updates" : "Resume live updates"}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--nx-text-faint)] hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
            >
              {live ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={refresh}
              title="Refresh now"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--nx-text-faint)] hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)]"
            >
              <RefreshCw
                className={cn("h-3 w-3", refreshing && "animate-spin")}
              />
            </button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {error ? (
            <p className="px-3 py-2 text-[11px] text-[var(--nx-error-fg)]">{error}</p>
          ) : null}

          {snapshot.activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--nx-text-muted)]">
              No activity recorded yet. Sign-ins, uploads, analyses and exports
              appear here the moment they happen.
            </p>
          ) : (
            <ul
              className="max-h-[420px] divide-y divide-[var(--nx-border-subtle)] overflow-y-auto"
              aria-live="polite"
            >
              {snapshot.activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 px-3 py-1.5">
                  <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>
                    {entry.action.split(".")[1] ?? entry.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px]">
                      <span className="font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                        {entry.action}
                      </span>
                      {entry.resourceType ? (
                        <span className="ml-1.5 text-[10.5px] text-[var(--nx-text-faint)]">
                          {entry.resourceType}:
                          {(entry.resourceId ?? "").slice(0, 8)}
                        </span>
                      ) : null}
                    </p>
                    {Object.keys(entry.metadata).length > 0 ? (
                      <p className="truncate font-mono text-[10px] text-[var(--nx-text-faint)]">
                        {JSON.stringify(entry.metadata)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--nx-text-faint)]">
                    {relativeTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
