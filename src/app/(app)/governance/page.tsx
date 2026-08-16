import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { readAuditLog } from "@/lib/store";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Governance" };
export const dynamic = "force-dynamic";

type AuditRow = {
  id?: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  user_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

const TONE: Record<string, "success" | "warning" | "error" | "neutral" | "purple"> = {
  "auth.login": "success",
  "auth.signup": "success",
  "auth.logout": "neutral",
  "auth.login_failed": "error",
  "auth.signup_failed": "error",
  "auth.password_changed": "warning",
  "auth.password_reset_requested": "warning",
  "dataset.uploaded": "purple",
  "dataset.deleted": "error",
  "dataset.downloaded": "warning",
  "analysis.completed": "success",
  "analysis.failed": "error",
  "report.exported": "purple",
  "workspace.created": "success",
};

export default async function GovernancePage() {
  const session = await requireSession();
  const entries = (await readAuditLog(200)) as unknown as AuditRow[];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Governance</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Append-only audit trail. Passwords, tokens and secrets are never
          recorded.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-4 w-4" />}
          title="No audit entries yet"
          description="Sign-ins, uploads, analyses, exports and deletions are all recorded here as they happen."
          className="py-16"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <ScrollText className="h-3.5 w-3.5" />
              Audit log
            </CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              most recent {entries.length}
              {session.mode === "local" ? " · local file" : " · Postgres"}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[var(--nx-text-muted)]">
                    {["When", "Action", "Resource", "Detail"].map((header) => (
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
                  {entries.map((entry, index) => (
                    <tr key={entry.id ?? index} className="hover:bg-[var(--nx-hover)]">
                      <td className="whitespace-nowrap border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-[var(--nx-text-muted)]">
                        {relativeTime(entry.created_at)}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                        <Badge tone={TONE[entry.action] ?? "neutral"}>
                          {entry.action}
                        </Badge>
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                        {entry.resource_type
                          ? `${entry.resource_type}:${(entry.resource_id ?? "").slice(0, 8)}`
                          : "—"}
                      </td>
                      <td className="max-w-[420px] truncate border-b border-[var(--nx-border-subtle)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--nx-text-muted)]">
                        {entry.metadata && Object.keys(entry.metadata).length > 0
                          ? JSON.stringify(entry.metadata)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
