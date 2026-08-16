/**
 * Platform roles and what each may do.
 *
 * Pure and dependency-free: no database, no session, no request. The whole
 * permission model is a lookup table that can be read in one sitting and
 * tested directly, rather than a set of `if (role === "admin")` checks spread
 * across the handlers that happen to need them.
 *
 * This is deliberately separate from the workspace roles (owner / admin /
 * analyst / viewer). Those describe a person's standing inside their own
 * workspace. These describe someone who operates Nexus itself. Every user is
 * the owner of their own workspace, so a workspace role can never be an
 * administrative gate.
 */

export const PLATFORM_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "support",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = [
  // Reading
  "users.read",
  "billing.read",
  "tickets.read",
  "audit.read",
  "security.read",
  "system.read",
  "analytics.read",

  // Acting on accounts
  "users.update",        // change name, verify email, change workspace role
  "users.suspend",       // suspend / ban / reactivate
  "users.reset_password",
  "users.delete",        // soft delete

  // Acting on sessions
  "security.revoke_session",

  // Acting on money
  "billing.refund",
  "billing.change_plan",

  // Support
  "tickets.reply",
  "tickets.assign",

  // Running the platform
  "notifications.send",
  "system.settings",     // feature flags, maintenance mode
  "system.secrets",      // API keys, webhook secrets
  "staff.manage",        // add or remove other staff
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The grant table.
 *
 * Written out per role rather than layered by inheritance. Inheritance reads
 * neatly and then hides exactly the question you need answered in a review —
 * "can a manager issue a refund?" — behind a chain of spreads.
 */
const GRANTS: Record<PlatformRole, readonly Permission[]> = {
  /* Everything. The only role that can change who else is staff, and the only
     one that can see or rotate secrets. */
  super_admin: PERMISSIONS,

  /* Runs the platform day to day. Cannot appoint other staff and cannot read
     secrets — those are the two powers that would let an admin quietly grant
     themselves anything else. */
  admin: [
    "users.read",
    "billing.read",
    "tickets.read",
    "audit.read",
    "security.read",
    "system.read",
    "analytics.read",
    "users.update",
    "users.suspend",
    "users.reset_password",
    "users.delete",
    "security.revoke_session",
    "billing.refund",
    "billing.change_plan",
    "tickets.reply",
    "tickets.assign",
    "notifications.send",
    "system.settings",
  ],

  /* Sees the whole picture and handles billing, but does not touch accounts:
     no suspensions, no password resets, no deletions. */
  manager: [
    "users.read",
    "billing.read",
    "tickets.read",
    "audit.read",
    "security.read",
    "system.read",
    "analytics.read",
    "billing.refund",
    "billing.change_plan",
    "tickets.reply",
    "tickets.assign",
    "notifications.send",
  ],

  /* Answers customers. Can look up an account to help, and nothing more —
     no money, no suspensions, no settings. */
  support: [
    "users.read",
    "tickets.read",
    "tickets.reply",
    "tickets.assign",
  ],
};

/** Human labels, used wherever a role is shown. */
export const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  support: "Support",
};

export const ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Full control, including managing staff and viewing secrets.",
  admin: "Runs the platform. Cannot appoint staff or read secrets.",
  manager: "Sees everything and handles billing. Cannot change accounts.",
  support: "Answers tickets and looks up accounts. No billing or settings.",
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    typeof value === "string" &&
    (PLATFORM_ROLES as readonly string[]).includes(value)
  );
}

/**
 * The single question the rest of the code asks.
 *
 * A null or unknown role is refused rather than defaulted, so a row with a
 * corrupt value fails closed instead of inheriting whatever the mildest role
 * happens to be.
 */
export function can(
  role: PlatformRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role || !isPlatformRole(role)) return false;
  return GRANTS[role].includes(permission);
}

/** Every permission a role holds. For rendering the roles page. */
export function permissionsFor(role: PlatformRole): readonly Permission[] {
  return GRANTS[role];
}

/**
 * Guards a role change.
 *
 * Two rules, both about the same failure: an account quietly acquiring more
 * power than the person granting it had.
 *   - Only a super admin may change staff at all.
 *   - Nobody may hand out a role they do not themselves hold, which stops an
 *     account from being promoted past the person doing the promoting.
 */
export function canAssignRole(
  actorRole: PlatformRole | null | undefined,
  targetRole: PlatformRole,
): boolean {
  if (!can(actorRole, "staff.manage")) return false;
  if (actorRole === "super_admin") return true;
  return actorRole === targetRole;
}
