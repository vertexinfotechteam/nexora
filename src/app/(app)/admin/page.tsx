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
import { buildAdminSnapshot } from "@/lib/admin";
import { getStaffMember } from "@/lib/admin/staff";
import { can, ROLE_LABELS } from "@/lib/admin/rbac";
import {
  buildPlatformOverview,
  listAuditLogs,
  listUsers,
} from "@/lib/admin/platform";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { AdminLivePanel } from "@/components/admin/live-panel";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { AuditLog } from "@/components/admin/audit-log";
import { ContactMessages } from "@/components/admin/contact-messages";
import { RolesPanel } from "@/components/admin/roles-panel";
import { UserTable } from "@/components/admin/user-table";
import { listContactMessages } from "@/lib/contact";
import { formatBytes, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * The platform admin panel.
 *
 * Gated on platform staff, not on a workspace role. Signing up makes every
 * user the owner of their own workspace, so `role === "owner"` is true for
 * everyone and can never be the gate here.
 *
 * Each section is fetched only when the operator's role can see it, so a
 * missing permission means the data is never read — not merely never drawn.
 */
export default async function AdminPage() {
  const session = await requireSession();
  const staff = await getStaffMember(session);

  if (!staff) {
    return (
      <div className="space-y-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Admin</h1>
        <EmptyState
          icon={<ShieldAlert className="h-4 w-4" />}
          title="This area is for platform staff"
          description="The admin panel controls Nexus itself — every account, not just this workspace — so it is limited to staff. If you are staff, sign in through the operations door with your staff account. If you need access, ask a super admin to add you."
          action={
            <div className="flex items-center gap-3">
              <Link
                href="/admin/login"
                className="text-[12px] font-medium text-[var(--nx-accent)] hover:underline"
              >
                Operations sign-in
              </Link>
              <Link
                href="/dashboard"
                className="text-[12px] text-[var(--nx-text-muted)] hover:underline"
              >
                Back to overview
              </Link>
            </div>
          }
          className="py-16"
        />
      </div>
    );
  }

  const role = staff.role;

  const [overview, snapshot, users, audit, messages] = await Promise.all([
    buildPlatformOverview(),
    buildAdminSnapshot(session),
    can(role, "users.read") ? listUsers({ pageSize: 50 }) : null,
    can(role, "audit.read") ? listAuditLogs({ limit: 300 }) : null,
    can(role, "tickets.read") ? listContactMessages(session, 100) : [],
  ]);

  const sections = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="space-y-3">
          {overview.missingTables.length > 0 ? (
            <Card>
              <CardBody className="flex items-start gap-2 p-3">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--nx-warning)]" />
                <div>
                  <p className="text-[12.5px] font-medium">
                    Some tables have not been created yet
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                    Run migration 0003 in Supabase to enable sessions, login
                    history, support tickets and billing. Until then the figures
                    below read &ldquo;unknown&rdquo; rather than zero, because a
                    zero would look like an answer.
                  </p>
                  <p className="mt-1.5 font-mono text-[10.5px] text-[var(--nx-text-faint)]">
                    {overview.missingTables.join(", ")}
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Users className="h-3 w-3" />} label="Total accounts" value={overview.totalUsers} accent />
            <Stat icon={<Activity className="h-3 w-3" />} label="Active (24h)" value={overview.activeUsers24h} />
            <Stat icon={<Activity className="h-3 w-3" />} label="Active (7d)" value={overview.activeUsers7d} />
            <Stat icon={<Users className="h-3 w-3" />} label="New (7d)" value={overview.newUsers7d} />
            <Stat icon={<Gauge className="h-3 w-3" />} label="Workspaces" value={overview.totalWorkspaces} />
            <Stat icon={<Database className="h-3 w-3" />} label="Datasets" value={overview.totalDatasets} />
            <Stat icon={<Zap className="h-3 w-3" />} label="Analyses" value={overview.totalAnalyses} />
            <Stat icon={<FileText className="h-3 w-3" />} label="Reports" value={overview.totalReports} />
            <Stat icon={<ShieldAlert className="h-3 w-3" />} label="Suspended" value={overview.suspendedUsers} warn={(overview.suspendedUsers ?? 0) > 0} />
            <Stat icon={<AlertTriangle className="h-3 w-3" />} label="Failed logins (24h)" value={overview.failedLogins24h} warn={(overview.failedLogins24h ?? 0) > 0} />
            <Stat icon={<FileText className="h-3 w-3" />} label="Open tickets" value={overview.openTickets} />
            <Stat icon={<Database className="h-3 w-3" />} label="Storage" text={formatBytes(snapshot.totals.storageBytes)} />
          </div>

          <AdminLivePanel initial={snapshot} />

          <Card>
            <CardHeader>
              <CardTitle>System health</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-2 p-3 sm:grid-cols-2">
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
        </div>
      ),
    },
  ];

  if (users) {
    sections.push({
      id: "users",
      label: "Users",
      content: <UserTable users={users.rows} role={role} />,
    });
  }

  if (can(role, "tickets.read")) {
    sections.push({
      id: "support",
      label: "Support",
      content: <ContactMessages initial={messages ?? []} />,
    });
  }

  if (audit) {
    sections.push({
      id: "audit",
      label: "Audit log",
      content: <AuditLog rows={audit} />,
    });
  }

  sections.push({
    id: "roles",
    label: "Roles",
    content: <RolesPanel currentRole={role} />,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Admin</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Every figure here is counted from records the platform actually wrote.
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {staff.fromBootstrap ? (
            <Badge tone="warning" title="Granted by NEXUS_PLATFORM_ADMIN_EMAILS, not by a staff record">
              Bootstrap access
            </Badge>
          ) : null}
          <Badge tone="purple">{ROLE_LABELS[role]}</Badge>
          <Badge tone={snapshot.backend === "supabase" ? "success" : "warning"}>
            {snapshot.backend === "supabase" ? "Supabase" : "Local mode"}
          </Badge>
        </div>
      </div>

      <AdminTabs sections={sections} />
    </div>
  );
}

/**
 * A figure, or an honest "unknown".
 *
 * null means the number could not be counted — usually a table that does not
 * exist yet. Rendering 0 there would read as "none", which is a different and
 * wrong answer.
 */
function Stat({
  icon,
  label,
  value,
  text,
  accent,
  warn,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: number | null;
  text?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const display =
    text ?? (value === null || value === undefined ? null : formatNumber(value));

  return (
    <Card>
      <CardBody className="p-3">
        <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-[var(--nx-text-faint)]">
          {icon}
          {label}
        </p>
        {display === null ? (
          <p
            className="mt-1 text-[13px] italic leading-none text-[var(--nx-text-faint)]"
            title="Not counted — the table does not exist yet"
          >
            unknown
          </p>
        ) : (
          <p
            className={`mt-1 text-[19px] font-semibold leading-none tracking-tight ${
              warn
                ? "text-[var(--nx-error)]"
                : accent
                  ? "text-[var(--nx-success)]"
                  : ""
            }`}
          >
            {display}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
