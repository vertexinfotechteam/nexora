import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { AppShell } from "@/components/shell/app-shell";
import { getCreditBalance } from "@/lib/credits";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isSupabaseConfigured() && !session.organizationId) redirect("/onboarding");

  const credits = await getCreditBalance(session);

  return (
    <AppShell session={session} credits={credits}>
      {children}
    </AppShell>
  );
}
