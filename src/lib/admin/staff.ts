import "server-only";

import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, PLATFORM_ADMIN_EMAILS } from "@/lib/env";
import { emailIsPlatformStaff } from "@/lib/platform-staff";
import { can, isPlatformRole, type Permission, type PlatformRole } from "./rbac";
import type { Session } from "@/lib/store/types";

/**
 * Who is staff, and what role do they hold.
 *
 * Two sources, in order:
 *   1. The `platform_staff` table, which is the real answer once staff exist.
 *   2. `NEXUS_PLATFORM_ADMIN_EMAILS`, which exists only to solve the
 *      bootstrap: the table starts empty, and only a super admin can add to
 *      it, so without a way in from configuration nobody could ever become
 *      the first one. Addresses on that list are treated as super admins.
 *
 * The env list is not a convenience for ongoing use — every staff member
 * beyond the first should be a table row, so that appointments are audited.
 */

export type StaffMember = {
  userId: string;
  email: string;
  role: PlatformRole;
  isActive: boolean;
  /** True when this identity comes from configuration, not the table. */
  fromBootstrap: boolean;
};

export async function getStaffMember(
  session: Session | null,
): Promise<StaffMember | null> {
  if (!session?.email) return null;

  const email = session.email.trim().toLowerCase();

  if (isSupabaseConfigured() && hasServiceClient()) {
    const { data, error } = await getServiceClient()
      .from("platform_staff")
      .select("user_id, email, role, is_active")
      .eq("user_id", session.userId)
      .maybeSingle();

    // A missing table means migration 0003 has not run. Fall through to the
    // bootstrap list rather than locking the operator out of their own panel.
    if (!error && data) {
      if (!data.is_active) return null;
      if (!isPlatformRole(data.role)) return null;
      return {
        userId: data.user_id,
        email: data.email,
        role: data.role,
        isActive: true,
        fromBootstrap: false,
      };
    }
  }

  if (emailIsPlatformStaff(email, PLATFORM_ADMIN_EMAILS)) {
    return {
      userId: session.userId,
      email,
      role: "super_admin",
      isActive: true,
      fromBootstrap: true,
    };
  }

  return null;
}

/** True when the session may perform `permission`. */
export async function hasPermission(
  session: Session | null,
  permission: Permission,
): Promise<boolean> {
  const staff = await getStaffMember(session);
  return can(staff?.role, permission);
}

/**
 * Asserts a permission inside a server action.
 *
 * Server actions are public endpoints — reachable by anyone who can guess the
 * id, whatever the UI happens to render — so every one of them re-checks
 * rather than trusting the page that drew the button.
 */
export async function requirePermission(
  session: Session | null,
  permission: Permission,
): Promise<StaffMember> {
  const staff = await getStaffMember(session);
  if (!staff || !can(staff.role, permission)) {
    throw new Error(`Not permitted: ${permission}`);
  }
  return staff;
}
