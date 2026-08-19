import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  buildOperationsOverview,
  listRecentEvents,
  listRecentSignups,
} from "@/lib/admin/operations";
import { AreaChart, BarChart } from "@/components/operations/mini-charts";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90] as const;

/** A figure, or an honest blank. null means "could not count", not "none". */
function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string | null;
  sub: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--nx-text-muted)]">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-[26px] font-semibold leading-none tabular-nums",
          tone === "warn" ? "text-[var(--nx-warning)]" : "",
          tone === "good" ? "text-[var(--nx-accent)]" : "",
        ].join(" ")}
      >
        {value === null ? <span className="text-[var(--nx-text-faint)]">unknown</span> : value}
      </p>
      <p className="mt-2 text-[11.5px] text-[var(--nx-text-muted)]">{sub}</p>
    </div>
  );
}

export default async function OperationsOverview({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.window);
  const windowDays = WINDOWS.includes(requested as (typeof WINDOWS)[number]) ? requested : 30;

  const [overview, signups, events] = await Promise.all([
    buildOperationsOverview(windowDays),
    listRecentSignups(8),
    listRecentEvents(10),
  ]);

  const unhealthy =
    (overview.failedAnalyses ?? 0) > 0 || (overview.serverErrors ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--nx-text-muted)]">
            Last {windowDays} days · counted from records the platform wrote
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {WINDOWS.map((days) => (
            <Link
              key={days}
              href={`/operations?window=${days}`}
              aria-current={days === windowDays ? "true" : undefined}
              className={[
                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                days === windowDays
                  ? "border-transparent bg-[var(--nx-purple)] font-semibold text-[var(--nx-purple-on)]"
                  : "border-[var(--nx-border)] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]",
              ].join(" ")}
            >
              {days}d
            </Link>
          ))}
        </div>
      </div>

      {overview.missingTables.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--nx-warning)]/35 bg-[var(--nx-warning)]/10 p-3.5">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--nx-warning)]" />
          <div>
            <p className="text-[13px] font-semibold">Some figures could not be counted</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
              These tables are not readable, so the figures they feed read
              &ldquo;unknown&rdquo; rather than zero — a zero would look like an
              answer. Running migration 0003 creates the ones it owns.
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] text-[var(--nx-text-faint)]">
              {overview.missingTables.join(", ")}
            </p>
          </div>
        </div>
      ) : null}

      {unhealthy ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--nx-error)]/35 bg-[var(--nx-error)]/10 p-3.5">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--nx-error)]" />
          <div>
            <p className="text-[13px] font-semibold text-[var(--nx-error)]">
              System health needs attention
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
              {overview.failedAnalyses ?? 0} failed analyses and{" "}
              {overview.serverErrors ?? 0} server errors in this window. Check the
              audit tab before assuming the figures below are complete.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total accounts" value={overview.totalUsers} sub={`${overview.newUsers ?? 0} new in window`} />
        <Stat label="Active workspaces" value={overview.activeWorkspaces} sub={`of ${overview.totalWorkspaces ?? "?"} in total`} />
        <Stat label="Paid accounts" value={overview.paidAccounts} sub="No payment provider connected yet" tone="good" />
        <Stat label="Suspended" value={overview.suspendedUsers} sub="Blocked from signing in" tone={(overview.suspendedUsers ?? 0) > 0 ? "warn" : undefined} />

        <Stat label="Analyses run" value={overview.analysesRun} sub="In this window" />
        <Stat label="Reports generated" value={overview.reportsGenerated} sub="PDF and Excel available" />
        <Stat label="Failed analyses" value={overview.failedAnalyses} sub="Credits are refunded automatically" tone={(overview.failedAnalyses ?? 0) > 0 ? "warn" : undefined} />
        <Stat label="Unread messages" value={overview.openMessages} sub="From the contact form" tone={(overview.openMessages ?? 0) > 0 ? "warn" : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BarChart title="Signups" subtitle="New accounts per day." points={overview.signups} />
        <AreaChart title="Platform activity" subtitle="Datasets, analyses and reports per day." points={overview.activity} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)]">
          <h2 className="border-b border-[var(--nx-border)] px-4 py-3 text-[13px] font-semibold">
            Recent signups
          </h2>
          {signups.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">No accounts yet.</p>
          ) : (
            <ul>
              {signups.map((s) => (
                <li key={s.userId} className="flex items-center gap-3 border-b border-[var(--nx-border)] px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <Link href={`/operations/accounts/${s.userId}`} className="block truncate text-[13px] font-medium hover:underline">
                      {s.name}
                    </Link>
                    <p className="truncate text-[11.5px] text-[var(--nx-text-muted)]">
                      {s.workspace ?? "No workspace"} · {s.createdAt ? relativeTime(s.createdAt) : "unknown"}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--nx-elevated)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--nx-text-muted)]">
                    {s.plan ?? "free"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)]">
          <h2 className="border-b border-[var(--nx-border)] px-4 py-3 text-[13px] font-semibold">
            Recent activity
          </h2>
          {events.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">Nothing recorded yet.</p>
          ) : (
            <ul>
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-[var(--nx-border)] px-4 py-3 last:border-0">
                  <span className="truncate font-mono text-[11.5px]">{e.action}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--nx-text-muted)]">
                    {relativeTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
