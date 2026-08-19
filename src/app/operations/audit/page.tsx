import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { can } from "@/lib/admin/rbac";
import { listAuditLogs } from "@/lib/admin/platform";
import { AuditLog } from "@/components/admin/audit-log";

export const dynamic = "force-dynamic";

/** Append-only record of what staff and the platform did. */
export default async function AuditPage() {
  const session = await getSession();
  const staff = session ? await getStaffMember(session) : null;

  if (!staff || !can(staff.role, "audit.read")) {
    return (
      <p className="text-[13px] text-[var(--nx-text-muted)]">
        Your role does not include reading the audit log.
      </p>
    );
  }

  const rows = await listAuditLogs({ limit: 300 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Audit</h1>
        <p className="mt-0.5 text-[12.5px] text-[var(--nx-text-muted)]">
          Who did what, when, and from where. Written after each change succeeds.
        </p>
      </div>
      <AuditLog rows={rows} />
    </div>
  );
}
