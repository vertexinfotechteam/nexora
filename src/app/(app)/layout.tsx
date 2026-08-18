import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { ensureWorkspace } from "@/lib/auth/provision";
import { AppShell } from "@/components/shell/app-shell";
import { getCreditBalance } from "@/lib/credits";
import { listNotifications } from "@/lib/notifications";
import { getStaffMember } from "@/lib/admin/staff";
import { FEATURES, PLANS, planForTier } from "@/lib/plans";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = await getSession();
  if (!session) redirect("/login");

  /*
   * A workspace is created silently rather than asked for.
   *
   * It exists so tenant data can be isolated — that is our problem, not
   * something the user came here to decide. Sending them to a "set up your
   * workspace" form adds a step, and a step that can fail. The only account
   * screens in this product are sign in and create account.
   */
  if (isSupabaseConfigured() && !session.organizationId) {
    const organizationId = await ensureWorkspace({
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      username: session.username,
    });

    if (!organizationId) {
      // Provisioning genuinely failed (database unreachable, for example).
      // Signing out is better than looping on a page that cannot load.
      redirect("/login?error=workspace");
    }

    session = await getSession();
    if (!session?.organizationId) redirect("/login?error=workspace");
  }

  const [credits, notifications, staff] = await Promise.all([
    getCreditBalance(session),
    listNotifications(session),
    getStaffMember(session),
  ]);

  return (
    <AppShell
      session={session}
      credits={credits}
      notifications={notifications}
      /*
       * The Admin link is shown on exactly the condition the Admin page
       * enforces. It used to be shown to workspace owners and admins, which is
       * every account in the system — so everyone saw a link that refused them
       * — while a staff member whose own workspace role was lower saw no link
       * to the panel they were entitled to. Both directions were wrong.
       */
      isPlatformStaff={Boolean(staff)}
      /*
       * Staff see every feature, whatever plan their own account is on.
       *
       * They are here to run the product and answer questions about it, and
       * neither is possible through a padlock — being unable to open the
       * screen a customer is asking about makes support guesswork.
       *
       * For everyone else this maps the stored tier to a plan. Only "free"
       * exists as a real subscription today, since no payment provider is
       * connected, but mapping through planForTier keeps this correct the
       * moment paid subscriptions become real rather than hard-coding "free"
       * and having to remember this line later.
       *
       * This unlocks the navigation, not the data: every page still resolves
       * its own tenant through the session, so staff opening Saved Views see
       * their own workspace, not a customer's.
       */
      planFeatures={
        staff ? FEATURES : PLANS[planForTier(session.plan)].features
      }
    >
      {children}
    </AppShell>
  );
}
