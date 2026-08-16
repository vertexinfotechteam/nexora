import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  ShieldAlert,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { buildAdminSnapshot, canAccessAdmin } from "@/lib/admin";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { AdminLivePanel } from "@/components/admin/live-panel";
import { formatBytes, formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireSession();

  if (!canAccessAdmin(session)) {
    return (
      <div className="space-y-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Admin</h1>
        <EmptyState
          icon={<ShieldAlert className="h-4 w-4" />}
          title="You do not have access to the admin panel"
          description={`The admin panel is limited to workspace owners and admins. Your role in this workspace is "${session.role}". Ask an owner if you need access.`}
          action={
            <Link
              href="/dashboard"
              className="text-[12px] text-[var(--nx-accent)] hover:underline"
            >
              Back to overview
            </Link>
          }
          className="py-16"
        />
      </div>
    );
  }

  const snapshot = await buildAdminSnapshot(session);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Admin</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Everything on this page comes from records the platform actually
          wrote.
        </p>
        <Badge tone={snapshot.backend === "supabase" ? "success" : "warning"} className="ml-auto">
          {snapshot.backend === "supabase" ? "Supabase" : "Local mode"}
        </Badge>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Stat icon={<Users className="h-3 w-3" />} label="Active now" value={String(snapshot.activeNow)} accent />
        <Stat icon={<Activity className="h-3 w-3" />} label="Analyses" value={formatNumber(snapshot.totals.analyses)} />
        <Stat icon={<Zap className="h-3 w-3" />} label="Credits used" value={formatNumber(snapshot.totals.creditsUsed)} />
        <Stat icon={<Database className="h-3 w-3" />} label="Datasets" value={String(snapshot.totals.datasets)} />
        <Stat icon={<Gauge className="h-3 w-3" />} label="Rows stored" value={formatNumber(snapshot.totals.rows)} />
        <Stat icon={<FileText className="h-3 w-3" />} label="Reports" value={String(snapshot.totals.reports)} />
        <Stat
          icon={<AlertTriangle className="h-3 w-3" />}
          label="Failed jobs"
          value={String(snapshot.totals.failedAnalyses)}
          warn={snapshot.totals.failedAnalyses > 0}
        />
      </div>

      {/* Live feed + throughput, refreshed client-side */}
      <AdminLivePanel initial={snapshot} />

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="h-3.5 w-3.5" />
              Users in this workspace
            </CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              {snapshot.users.length} seen
            </span>
          </CardHeader>
          <CardBody className="p-0">
            {snapshot.users.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">
                No activity has been recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-[var(--nx-text-muted)]">
                      {["User", "Status", "Last seen", "Actions 24h", "Analyses", "Credits"].map(
                        (header) => (
                          <th
                            key={header}
                            className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.users.map((user) => (
                      <tr key={user.userId} className="hover:bg-[var(--nx-hover)]">
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-medium">
                          {user.label}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                          {user.online ? (
                            <span className="inline-flex items-center gap-1.5 text-[var(--nx-success)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--nx-success)] nx-live-dot" />
                              Online
                            </span>
                          ) : (
                            <span className="text-[var(--nx-text-faint)]">Idle</span>
                          )}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                          {user.lastSeen ? relativeTime(user.lastSeen) : "—"}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                          {user.actions24h}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                          {user.analyses}
                        </td>
                        <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                          {user.creditsUsed}/{user.creditLimit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-3">
          {/* Health */}
          <Card>
            <CardHeader>
              <CardTitle>System health</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 p-3">
              {snapshot.health.map((item) => (
                <div key={item.label} className="flex items-start gap-2">
                  {item.ok ? (
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
                  ) : (
                    <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-error)]" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium">{item.label}</p>
                    <p className="text-[11px] leading-relaxed text-[var(--nx-text-muted)]">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Action breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Most frequent actions</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 p-3">
              {snapshot.actionBreakdown.length === 0 ? (
                <p className="text-[12px] text-[var(--nx-text-muted)]">
                  No actions recorded yet.
                </p>
              ) : (
                snapshot.actionBreakdown.map((item) => {
                  const max = snapshot.actionBreakdown[0].count || 1;
                  return (
                    <div key={item.action}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                          {item.action}
                        </span>
                        <span className="font-mono text-[10.5px]">{item.count}</span>
                      </div>
                      <span
                        aria-hidden
                        className="mt-0.5 block h-1 overflow-hidden rounded-full bg-[var(--nx-border)]"
                      >
                        <span
                          className="block h-full rounded-full bg-[var(--nx-purple)]"
                          style={{ width: `${(item.count / max) * 100}%` }}
                        />
                      </span>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          {/* Storage */}
          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
            </CardHeader>
            <CardBody className="p-3">
              <p className="text-[20px] font-semibold leading-none tracking-tight">
                {formatBytes(snapshot.totals.storageBytes)}
              </p>
              <p className="mt-1.5 text-[11px] text-[var(--nx-text-muted)]">
                across {snapshot.totals.datasets} dataset
                {snapshot.totals.datasets === 1 ? "" : "s"} and{" "}
                {formatNumber(snapshot.totals.rows)} rows
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardBody className="p-3">
        <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-[var(--nx-text-faint)]">
          {icon}
          {label}
        </p>
        <p
          className={`mt-1 text-[19px] font-semibold leading-none tracking-tight ${
            warn
              ? "text-[var(--nx-error)]"
              : accent
                ? "text-[var(--nx-success)]"
                : ""
          }`}
        >
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
