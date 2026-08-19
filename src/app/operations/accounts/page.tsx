import Link from "next/link";
import { Search } from "lucide-react";
import { listUsers } from "@/lib/admin/platform";
import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { can } from "@/lib/admin/rbac";

export const dynamic = "force-dynamic";

/**
 * Every account in the system, searchable.
 *
 * Changes are made on the detail page rather than from a row action here: each
 * one needs a written reason, and a control that can suspend or delete from a
 * list of look-alike rows is a mis-click waiting to happen.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  const session = await getSession();
  const staff = session ? await getStaffMember(session) : null;

  if (!staff || !can(staff.role, "users.read")) {
    return (
      <p className="text-[13px] text-[var(--nx-text-muted)]">
        Your role does not include reading accounts.
      </p>
    );
  }

  const users = await listUsers({ search, page, pageSize: 25 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Accounts</h1>
        <p className="mt-0.5 text-[12.5px] text-[var(--nx-text-muted)]">
          Every account in Nexus. Changes are audited with a mandatory reason.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--nx-text-faint)]" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Name or email…"
            className="w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-card)] py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[var(--nx-accent)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[var(--nx-purple)] px-4 py-2 text-[13px] font-semibold text-[var(--nx-purple-on)]"
        >
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)]">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-[var(--nx-border)] text-[10.5px] uppercase tracking-wide text-[var(--nx-text-muted)]">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">State</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[12.5px] text-[var(--nx-text-muted)]">
                  {search ? `No account matches “${search}”.` : "No accounts yet."}
                </td>
              </tr>
            ) : (
              users.rows.map((u) => (
                <tr key={u.userId} className="border-b border-[var(--nx-border)] text-[12.5px] last:border-0">
                  <td className="px-4 py-3">{u.displayName || u.username || <span className="text-[var(--nx-text-faint)]">(unnamed)</span>}</td>
                  <td className="px-4 py-3 text-[var(--nx-text-muted)]">{u.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--nx-elevated)] px-2 py-0.5 text-[10.5px] font-medium">
                      {u.plan ?? "free"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.state === "active" ? (
                      <span className="text-[var(--nx-text-muted)]">active</span>
                    ) : (
                      <span className="font-medium text-[var(--nx-warning)]">{u.state}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--nx-text-muted)]">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/operations/accounts/${u.userId}`}
                      className="rounded-lg border border-[var(--nx-border)] px-3 py-1.5 text-[12px] font-medium hover:border-[var(--nx-accent)]"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-[var(--nx-text-muted)]">
        Showing {users.rows.length} of {users.total} · page {users.page}
      </p>
    </div>
  );
}
