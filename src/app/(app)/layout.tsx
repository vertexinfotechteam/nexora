import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { ensureWorkspace } from "@/lib/auth/provision";
import { AppShell } from "@/components/shell/app-shell";
import { getCreditBalance } from "@/lib/credits";

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

  const credits = await getCreditBalance(session);

  return (
    <AppShell session={session} credits={credits}>
      {children}
    </AppShell>
  );
}
