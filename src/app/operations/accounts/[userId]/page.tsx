import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { can } from "@/lib/admin/rbac";
import { listUsers } from "@/lib/admin/platform";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { ManageAccount } from "@/components/operations/manage-account";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--nx-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{value}</dd>
    </div>
  );
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const session = await getSession();
  const staff = session ? await getStaffMember(session) : null;
  if (!staff || !can(staff.role, "users.read")) {
    return (
      <p className="text-[13px] text-[var(--nx-text-muted)]">
        Your role does not include reading accounts.
      </p>
    );
  }

  // Read through the same listing the table uses, so the state shown here and
  // the state shown there can never disagree.
  const page = await listUsers({ search: "", pageSize: 100 });
  const account = page.rows.find((row) => row.userId === userId);
  if (!account) notFound();

  let organizationId: string | null = null;
  if (hasServiceClient()) {
    const { data } = await getServiceClient()
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    organizationId = (data as { organization_id?: string } | null)?.organization_id ?? null;
  }

  return (
    <div className="space-y-4">
      <Link
        href="/operations/accounts"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All accounts
      </Link>

      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          {account.displayName || account.username || account.email || "Account"}
        </h1>
        <p className="mt-0.5 text-[12.5px] text-[var(--nx-text-muted)]">{account.email}</p>
      </div>

      <dl className="grid gap-4 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="State" value={account.state} />
        <Field label="Plan" value={account.plan ?? "free"} />
        <Field label="Workspace" value={account.workspaceName ?? "none"} />
        <Field label="Email confirmed" value={account.emailConfirmed ? "yes" : "no"} />
        <Field
          label="Last sign-in"
          value={account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleString("en-GB") : "never"}
        />
      </dl>

      <ManageAccount
        userId={account.userId}
        email={account.email ?? ""}
        organizationId={organizationId}
        state={account.state}
        canSuspend={can(staff.role, "users.suspend")}
        canDelete={can(staff.role, "users.delete")}
        canBill={can(staff.role, "billing.change_plan")}
        isSelf={staff.userId === account.userId}
      />
    </div>
  );
}
