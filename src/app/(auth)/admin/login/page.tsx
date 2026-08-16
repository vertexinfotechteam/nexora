import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

/**
 * /admin/login — the operations door.
 *
 * Lives in the (auth) group so it shares the centred-card shell with the other
 * sign-in screens, while resolving to /admin/login. The panel itself is
 * /admin, rendered by the (app) group; the two never collide because they are
 * different paths.
 */
export const metadata: Metadata = {
  title: "Operations sign-in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // Already signed in as staff: send them straight through rather than asking
  // for a password they have just proved they know.
  const session = await getSession();
  if (session) {
    const staff = await getStaffMember(session);
    if (staff) redirect("/admin");
  }

  return <AdminLoginForm />;
}
