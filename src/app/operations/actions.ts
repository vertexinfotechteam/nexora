"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/admin/staff";
import { recordAdminAction } from "@/lib/admin/platform";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { STORAGE_BUCKET } from "@/lib/storage";

/**
 * The two account actions this panel adds: suspending billing, and permanent
 * deletion.
 *
 * Everything else an operator can do already exists in the admin panel and is
 * not duplicated here.
 *
 * Three rules hold for every function:
 *   1. The permission is checked on the server, on every call. A server action
 *      is a public endpoint; whether the UI drew the button is not a control.
 *   2. A reason is mandatory and is stored. An action nobody can explain later
 *      is worse than one that did not happen.
 *   3. The audit row is written after the change succeeds, so a failed action
 *      never leaves a record claiming it happened.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Long enough that "asdf" does not pass as an explanation. */
const MIN_REASON = 8;

async function actorIp(): Promise<string | null> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null
  );
}

function unavailable(): ActionResult {
  return { ok: false, error: "This action needs Supabase and a service role key." };
}

/**
 * Suspends or restores the billing subscription for a workspace.
 *
 * Separate from suspending the account: this stops the paid plan while leaving
 * the person able to sign in and read their own data, which is what a failed
 * payment or a billing dispute calls for. Suspending sign-in is the account
 * action, and is deliberately a different decision.
 */
export async function setSubscriptionStateAction(
  organizationId: string,
  state: "active" | "suspended" | "cancelled",
  reason: string,
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "billing.change_plan");
  } catch {
    return { ok: false, error: "You do not have permission to change billing." };
  }

  if (reason.trim().length < MIN_REASON) {
    return { ok: false, error: "Give a reason of at least 8 characters, with a ticket reference where there is one." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const client = getServiceClient();

  const { data: existing, error: readError } = await client
    .from("subscriptions")
    .select("id, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: `Billing records are not readable: ${readError.message}`,
    };
  }

  const before = existing?.status ?? "none";

  if (existing) {
    const { error } = await client
      .from("subscriptions")
      .update({ status: state })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Nothing to suspend. Saying so is more useful than silently creating a
    // subscription row that no payment ever backed.
    return {
      ok: false,
      error: "This workspace has no subscription on record, so there is nothing to change.",
    };
  }

  await recordAdminAction({
    actorId: staff.userId,
    action: `admin.billing.${state}`,
    targetType: "organization",
    targetId: organizationId,
    ipAddress: await actorIp(),
    metadata: { reason: reason.trim(), before, after: state, actor_role: staff.role },
  });

  revalidatePath("/operations");
  return { ok: true, message: `Subscription ${state}.` };
}

/**
 * Deletes an account and everything belonging to it, permanently.
 *
 * This is the one irreversible action in the product, so it is gated four
 * ways: the permission, a reason, the operator typing the account's own email
 * back, and a refusal to act on themselves.
 *
 * The order of removal is forced by the schema rather than chosen. Both
 * `organizations.created_by` and `datasets.owner_id` are ON DELETE RESTRICT,
 * so deleting the auth record first fails with a foreign key error. Removing
 * the workspaces first takes their datasets, reports and analyses with them by
 * cascade, which leaves nothing pointing at the account by the time it goes.
 *
 * Stored files are removed before the rows that name them: once the dataset
 * rows are gone there is no longer any record of which objects to delete, and
 * the customer's data would be left sitting in the bucket after they had been
 * told it was deleted.
 */
export async function deleteAccountAction(
  userId: string,
  reason: string,
  confirmEmail: string,
): Promise<ActionResult> {
  const session = await getSession();

  let staff;
  try {
    staff = await requirePermission(session, "users.delete");
  } catch {
    return { ok: false, error: "You do not have permission to delete accounts." };
  }

  if (staff.userId === userId) {
    return { ok: false, error: "You cannot delete your own account from here." };
  }
  if (reason.trim().length < MIN_REASON) {
    return { ok: false, error: "Give a reason of at least 8 characters, with a ticket reference where there is one." };
  }
  if (!isSupabaseConfigured() || !hasServiceClient()) return unavailable();

  const client = getServiceClient();

  const { data: target, error: lookupError } = await client.auth.admin.getUserById(userId);
  if (lookupError || !target?.user) {
    return { ok: false, error: "That account no longer exists." };
  }

  const email = target.user.email ?? "";
  if (confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return { ok: false, error: "The email typed does not match this account." };
  }

  // Workspaces this account created. Ones it merely belongs to are left alone:
  // they are someone else's, and membership falls away by cascade.
  const { data: ownedOrgs, error: orgError } = await client
    .from("organizations")
    .select("id, name")
    .eq("created_by", userId);

  if (orgError) return { ok: false, error: `Could not read workspaces: ${orgError.message}` };

  const orgIds = (ownedOrgs ?? []).map((o) => (o as { id: string }).id);
  let filesRemoved = 0;

  if (orgIds.length > 0) {
    const { data: files } = await client
      .from("dataset_files")
      .select("storage_path")
      .in("organization_id", orgIds);

    const paths = (files ?? [])
      .map((f) => (f as { storage_path: string | null }).storage_path)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      // A storage failure must not abort the deletion half-way, leaving an
      // account that is partly gone. It is reported instead.
      const { error: removeError } = await client.storage.from(STORAGE_BUCKET).remove(paths);
      if (!removeError) filesRemoved = paths.length;
    }

    const { error: deleteOrgError } = await client
      .from("organizations")
      .delete()
      .in("id", orgIds);

    if (deleteOrgError) {
      return {
        ok: false,
        error: `Could not remove the workspace, so the account was left untouched: ${deleteOrgError.message}`,
      };
    }
  }

  const { error: authError } = await client.auth.admin.deleteUser(userId);
  if (authError) {
    return {
      ok: false,
      error: `The workspace was removed but the sign-in record was not: ${authError.message}`,
    };
  }

  /*
   * Recorded with the email and workspace names spelled out, because the rows
   * that held them no longer exist. An audit entry pointing at a deleted id
   * would say only that something was deleted, which is not an audit trail.
   *
   * The entry itself survives: platform rows are written with a null
   * organization_id, and audit_logs.user_id is ON DELETE SET NULL.
   */
  await recordAdminAction({
    actorId: staff.userId,
    action: "admin.user.deleted",
    targetType: "user",
    targetId: userId,
    ipAddress: await actorIp(),
    metadata: {
      reason: reason.trim(),
      deleted_email: email,
      workspaces: (ownedOrgs ?? []).map((o) => (o as { name: string }).name),
      files_removed: filesRemoved,
      actor_role: staff.role,
    },
  });

  revalidatePath("/operations");
  revalidatePath("/operations/accounts");
  return {
    ok: true,
    message: `${email} deleted — ${orgIds.length} workspace(s), ${filesRemoved} stored file(s).`,
  };
}
