import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, PLATFORM_ADMIN_EMAILS } from "@/lib/env";
import { emailIsPlatformStaff } from "@/lib/platform-staff";
import { insertLocal, readCollection, updateLocal } from "@/lib/store/local";
import type { Session } from "@/lib/store/types";

/**
 * Messages sent from the public "ask our team" form.
 *
 * These are platform-level, not workspace-level: they come from visitors who
 * may have no account at all. They are stored with no organization_id and read
 * back only by platform staff.
 */

export type ContactStatus = "new" | "read" | "replied" | "archived";

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  user_id: string | null;
  status: ContactStatus;
  source_path: string | null;
  user_agent: string | null;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
};

const COLLECTION = "contact_messages";

/**
 * Who may read what visitors wrote.
 *
 * Not a workspace role. Signing up makes you the owner of your own workspace,
 * so `role === "owner"` is true for every user in the system; gating on it
 * would hand every customer the name, email and message of every visitor who
 * ever used the form. Membership of this list is configuration the operator
 * controls, and an unconfigured list means nobody reads them.
 */
export function isPlatformStaff(session: Session | null): boolean {
  return emailIsPlatformStaff(session?.email, PLATFORM_ADMIN_EMAILS);
}

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Captured server-side, never read from the submitted form body. */
  userId: string | null;
  sourcePath: string | null;
  userAgent: string | null;
};

/**
 * Stores a message. Uses the service key because the public form has no
 * session to authenticate as — the table's insert policy allows anonymous
 * writes, but local mode has no policies at all, so both paths are explicit.
 */
export async function saveContactMessage(
  input: ContactInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: ContactMessage = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    user_id: input.userId,
    status: "new",
    source_path: input.sourcePath,
    user_agent: input.userAgent?.slice(0, 400) ?? null,
    created_at: new Date().toISOString(),
    handled_at: null,
    handled_by: null,
  };

  if (isSupabaseConfigured() && hasServiceClient()) {
    const { error } = await getServiceClient()
      .from(COLLECTION)
      .insert(row);

    if (error) {
      // The table is missing until 0002 has been applied. Postgres calls that
      // 42P01; PostgREST answers from its own schema cache and calls it
      // PGRST205, so both mean the same thing to a caller here.
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /schema cache/i.test(error.message)
      ) {
        return {
          ok: false,
          error:
            "The contact table has not been created yet. Run the 0002 migration in Supabase.",
        };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  await insertLocal<ContactMessage>(COLLECTION, row);
  return { ok: true };
}

/**
 * Reads messages for the admin panel. Callers must have checked
 * isPlatformStaff() first; this asserts it again so a future caller cannot
 * forget and leak the table.
 */
export async function listContactMessages(
  session: Session | null,
  limit = 50,
): Promise<ContactMessage[]> {
  if (!isPlatformStaff(session)) return [];

  if (isSupabaseConfigured() && hasServiceClient()) {
    const { data, error } = await getServiceClient()
      .from(COLLECTION)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as ContactMessage[];
  }

  const rows = await readCollection<ContactMessage>(COLLECTION);
  return rows
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Triage from the admin panel. */
export async function setContactStatus(
  session: Session | null,
  id: string,
  status: ContactStatus,
): Promise<boolean> {
  if (!isPlatformStaff(session) || !session) return false;

  const patch = {
    status,
    handled_at: new Date().toISOString(),
    handled_by: session.userId,
  };

  if (isSupabaseConfigured() && hasServiceClient()) {
    const { error } = await getServiceClient()
      .from(COLLECTION)
      .update(patch)
      .eq("id", id);
    return !error;
  }

  await updateLocal<ContactMessage>(COLLECTION, id, patch);
  return true;
}

/** Unread count, for the badge on the admin panel. */
export async function countNewContactMessages(
  session: Session | null,
): Promise<number> {
  if (!isPlatformStaff(session)) return 0;
  const rows = await listContactMessages(session, 200);
  return rows.filter((row) => row.status === "new").length;
}
