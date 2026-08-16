"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { isPlatformStaff, setContactStatus, type ContactStatus } from "@/lib/contact";

const ALLOWED: ContactStatus[] = ["new", "read", "replied", "archived"];

/**
 * Triage a contact message from the admin panel.
 *
 * The staff check is repeated here rather than trusted from the page that
 * rendered the button: a server action is a public endpoint, reachable by
 * anyone who can guess its id, regardless of what the UI shows.
 */
export async function updateContactStatusAction(
  id: string,
  status: ContactStatus,
): Promise<boolean> {
  if (!ALLOWED.includes(status)) return false;

  const session = await getSession();
  if (!isPlatformStaff(session)) return false;

  const ok = await setContactStatus(session, id, status);
  if (ok) revalidatePath("/admin");
  return ok;
}
