import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { ROLE_LABELS } from "@/lib/admin/rbac";
import { OperationsNav } from "@/components/operations/operations-nav";
import { SignOutButton } from "@/components/operations/sign-out-button";

export const metadata: Metadata = {
  title: "Nexus operations",
  robots: { index: false, follow: false },
};

/**
 * Chrome for the operations panel.
 *
 * Deliberately outside the app shell. This panel acts on every account in the
 * system rather than the one workspace the sidebar is scoped to, and an
 * operator suspending someone else's billing should never be one misread
 * heading away from thinking they are in their own dashboard. A different
 * frame, in a different colour, is the cheapest way to keep that distinction.
 *
 * The existing /admin panel is untouched and still reachable — this one adds
 * the accounts view and the two destructive actions, and does not replace it.
 */
export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const staff = session ? await getStaffMember(session) : null;

  /*
   * Refused rather than redirected. A redirect to the sign-in page tells an
   * unauthenticated caller that this path exists and is worth returning to;
   * this says only that there is nothing here for them.
   */
  if (!staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141a17] px-6 text-center">
        <div className="max-w-md space-y-3">
          <ShieldCheck className="mx-auto h-7 w-7 text-[#3fb489]" />
          <h1 className="text-[16px] font-semibold text-white">This area is for platform staff</h1>
          <p className="text-[12.5px] leading-relaxed text-white/60">
            Operations controls every account in Nexus, not one workspace, so it
            is limited to staff. If you are staff, sign in through the
            operations door.
          </p>
          <div className="flex items-center justify-center gap-4 pt-1">
            <Link href="/admin/login" className="text-[12.5px] font-medium text-[#3fb489] hover:underline">
              Operations sign-in
            </Link>
            <Link href="/dashboard" className="text-[12.5px] text-white/50 hover:underline">
              Back to the app
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--nx-bg)]">
      <header className="bg-[#1c231f] text-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 pt-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[#3fb489]" />
          <span className="text-[15px] font-semibold tracking-tight">Nexus operations</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-white/70">
            {ROLE_LABELS[staff.role]}
          </span>
          {staff.fromBootstrap ? (
            <span
              className="rounded-full bg-[#d6a84f]/20 px-2 py-0.5 text-[10.5px] font-medium text-[#e8c37c]"
              title="Granted by NEXUS_PLATFORM_ADMIN_EMAILS rather than by a staff record"
            >
              bootstrap access
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-4">
            <Link href="/dashboard" className="text-[12.5px] text-white/70 hover:text-white">
              Back to the app
            </Link>
            <SignOutButton />
          </div>
        </div>

        <OperationsNav />
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">{children}</main>
    </div>
  );
}
