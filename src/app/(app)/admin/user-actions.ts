"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/admin/staff";
import { recordAdminAction } from "@/lib/admin/platform";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Account actions available to platform staff.
 *
 * Three rules hold for every function here:
 *   1. The permission is checked server-side, on every call. A server action
 *      is a public endpoint; what the UI chose to render is not a control.
 *   2. Nothing is hard-deleted. Suspension and removal are states, so a
 *      mistake is recoverable and the account's data survives it.
 *   3. Every action writes an audit row naming the actor, the target and the
 *      address it came from — written after the change, so a failed action
 *      does not leave a record claiming it happened.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

async function actorIp(): Promise<string | null> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null
  );
}

function unavailable(): ActionResult {
  return {
    ok: false,
    error: "This action needs Supabase and a service role key to be configured.",
  };
}

/** Suspend, ban or reactivate an account. */
export async function setUserStateAction(
  userId: string,
  state: "active" | "suspended" | "banned",
  reason: string,
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "users.suspend");
  } catch {
    return { ok: false, error: "You do not have permission to change account status." };
  }

  if (staff.userId === userId) {
    return { ok: false, error: "You cannot change the status of your own account." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const client = getServiceClient();

  /*
   * Two writes, deliberately.
   *
   * `user_status` is ours and carries the reason and who decided it, which is
   * what an operator needs later. The ban on the auth record is what actually
   * stops the account signing in — without it the row would be a note that
   * changed nothing.
   */
  const { error: statusError } = await client.from("user_status").upsert({
    user_id: userId,
    state,
    reason: reason.trim() || null,
    changed_by: staff.userId,
    changed_at: new Date().toISOString(),
  });

  if (statusError) return { ok: false, error: statusError.message };

  const { error: authError } = await client.auth.admin.updateUserById(userId, {
    // "none" lifts an existing ban; Supabase has no separate un-ban call.
    ban_duration: state === "active" ? "none" : "876000h",
  });

  if (authError) return { ok: false, error: authError.message };

  await recordAdminAction({
    actorId: staff.userId,
    action: `admin.user.${state}`,
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: { reason: reason.trim() || null, actor_role: staff.role },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/** Sends a password reset email. Staff never see or set the password. */
export async function resetUserPasswordAction(
  userId: string,
  email: string,
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "users.reset_password");
  } catch {
    return { ok: false, error: "You do not have permission to reset passwords." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  /*
   * A recovery link is generated rather than a password being set.
   *
   * Setting one would mean a staff member knowing a credential for an account
   * that is not theirs, and the user having no way to tell it happened. The
   * link goes to the address on the account, so control stays with its owner.
   */
  const { error } = await getServiceClient().auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) return { ok: false, error: error.message };

  await recordAdminAction({
    actorId: staff.userId,
    action: "admin.user.password_reset_sent",
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: { actor_role: staff.role },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/** Marks an email address as confirmed. */
export async function verifyUserEmailAction(userId: string): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "users.update");
  } catch {
    return { ok: false, error: "You do not have permission to change accounts." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const { error } = await getServiceClient().auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (error) return { ok: false, error: error.message };

  await recordAdminAction({
    actorId: staff.userId,
    action: "admin.user.email_verified",
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: { actor_role: staff.role },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/** Changes a user's role inside their own workspace. */
export async function setWorkspaceRoleAction(
  userId: string,
  role: "owner" | "admin" | "analyst" | "viewer",
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "users.update");
  } catch {
    return { ok: false, error: "You do not have permission to change roles." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const { error } = await getServiceClient()
    .from("organization_members")
    .update({ role })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  await recordAdminAction({
    actorId: staff.userId,
    action: "admin.user.role_changed",
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: { new_role: role, actor_role: staff.role },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Ends every active session for an account.
 *
 * Used when a session is believed to be in the wrong hands. Revoking on the
 * auth server is what makes the existing tokens dead; marking our own rows is
 * only the record of it.
 */
export async function revokeUserSessionsAction(
  userId: string,
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "security.revoke_session");
  } catch {
    return { ok: false, error: "You do not have permission to end sessions." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const client = getServiceClient();
  const { error } = await client.auth.admin.signOut(userId, "global");
  if (error) return { ok: false, error: error.message };

  await client
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: staff.userId })
    .eq("user_id", userId)
    .is("revoked_at", null);

  await recordAdminAction({
    actorId: staff.userId,
    action: "admin.user.sessions_revoked",
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: { actor_role: staff.role },
  });

  revalidatePath("/admin");
  return { ok: true };
}
