"use server";

import { getSession } from "@/lib/auth/session";
import { markAllRead } from "@/lib/notifications";

/** Called when the notifications dropdown is opened. */
export async function markAllReadAction(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return markAllRead(session);
}
