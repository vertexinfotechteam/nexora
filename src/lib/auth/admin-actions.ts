"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/admin/staff";
import { audit } from "@/lib/store";
import { limitAction } from "@/lib/security/guard";

/**
 * Staff sign-in for the operations panel.
 *
 * A separate door, not a separate security boundary. It is the same Supabase
 * account and the same password — a different URL cannot make a credential
 * stronger, and it would be dishonest to present it as though it could. What
 * it does buy:
 *
 *   - Staff are turned away at the door instead of signing in successfully
 *     and then meeting a refusal, which is a confusing way to learn you are
 *     in the wrong place.
 *   - A customer who lands here is told plainly where their own sign-in is.
 *   - Failed attempts against the operations door are audited separately, so
 *     someone probing it stands out from ordinary login noise.
 *
 * The real gate remains getStaffMember(), re-checked when /admin renders. This
 * page cannot be bypassed into anything, because signing in here grants
 * exactly the session that signing in anywhere else would.
 */

export type AdminAuthState = {
  error?: string;
  email?: string;
} | null;

/*
 * One message for every failure.
 *
 * Wrong password, no such account, and "correct password but not staff" all
 * answer identically. Distinguishing them would turn this form into a way to
 * discover which addresses are staff — the most useful thing an attacker
 * could learn from a page like this.
 */
const GENERIC_ERROR =
  "Those credentials are not valid for the operations panel.";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function adminSignInAction(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_ERROR, email: String(formData.get("email") ?? "") };
  }

  const { email, password } = parsed.data;

  if (!isSupabaseConfigured()) {
    return {
      error: "The operations panel needs Supabase to be configured.",
      email,
    };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  const context = {
    ip_address: ip === "unknown" ? undefined : ip,
    user_agent: headerList.get("user-agent") ?? undefined,
  };

  // Shared limiter; this used to keep its own Map.
  if (!(await limitAction("adminLogin")).allowed) {
    await audit({
      organization_id: null,
      user_id: null,
      action: "admin.login_rate_limited",
      ...context,
    });
    return {
      error: "Too many attempts. Wait a few minutes and try again.",
      email,
    };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: GENERIC_ERROR, email };

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await audit({
      organization_id: null,
      user_id: null,
      action: "admin.login_failed",
      metadata: { reason: "bad_credentials" },
      ...context,
    });
    return { error: GENERIC_ERROR, email };
  }

  /*
   * Signed in — but that only proves the password. Staff is a separate
   * question, and the answer decides whether this session keeps existing:
   * a non-staff sign-in through this door is ended immediately rather than
   * left open, so the door grants nothing the person did not already have.
   */
  const session = await getSession();
  const staff = await getStaffMember(session);

  if (!staff) {
    await supabase.auth.signOut();
    await audit({
      organization_id: null,
      user_id: session?.userId ?? null,
      action: "admin.login_denied_not_staff",
      ...context,
    });
    return { error: GENERIC_ERROR, email };
  }

  await audit({
    organization_id: null,
    user_id: staff.userId,
    action: "admin.login",
    metadata: { role: staff.role },
    ...context,
  });

  redirect("/admin");
}
