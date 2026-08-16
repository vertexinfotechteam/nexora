import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { readCollection, mutateCollection } from "@/lib/store/local";
import type { Session } from "@/lib/store/types";

/**
 * In-app notifications.
 *
 * Scoped to one person in one workspace. Reads go through the user's own
 * client so RLS is the thing enforcing that, not a WHERE clause we could
 * forget.
 */

export type NotificationLevel = "info" | "success" | "warning" | "error";

export type AppNotification = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string | null;
  level: NotificationLevel;
  read_at: string | null;
  link: string | null;
  created_at: string;
};

const COLLECTION = "notifications";

export async function listNotifications(
  session: Session,
  limit = 15,
): Promise<AppNotification[]> {
  if (isSupabaseConfigured()) {
    const supabase = await getServerSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from(COLLECTION)
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as AppNotification[];
  }

  const rows = await readCollection<AppNotification>(COLLECTION);
  return rows
    .filter((row) => row.user_id === session.userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export function countUnread(notifications: AppNotification[]): number {
  return notifications.filter((notification) => !notification.read_at).length;
}

/** Marks everything currently unread as read. */
export async function markAllRead(session: Session): Promise<boolean> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getServerSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from(COLLECTION)
      .update({ read_at: now })
      .eq("user_id", session.userId)
      .is("read_at", null);

    return !error;
  }

  await mutateCollection<AppNotification>(COLLECTION, (rows) =>
    rows.map((row) =>
      row.user_id === session.userId && !row.read_at
        ? { ...row, read_at: now }
        : row,
    ),
  );
  return true;
}
