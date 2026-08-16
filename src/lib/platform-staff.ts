/**
 * Who counts as platform staff.
 *
 * Deliberately pure and dependency-free — no env, no database, no Supabase —
 * so the rule that guards visitors' contact messages can be unit-tested
 * directly rather than inferred from the call sites that use it.
 */

/** Normalises one configured or submitted address for comparison. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses the `NEXUS_PLATFORM_ADMIN_EMAILS` value.
 * Blank entries are dropped so a trailing comma cannot produce an empty
 * string that would then match an account with no email.
 */
export function parseStaffAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map(normalise)
    .filter(Boolean);
}

/**
 * True when `email` is on the allowlist.
 *
 * An empty allowlist matches nobody. That is the safe default: an operator who
 * has not configured the list should see no messages, rather than the list
 * silently falling open to every user.
 */
export function emailIsPlatformStaff(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false;
  const candidate = normalise(email);
  if (!candidate) return false;
  return allowlist.includes(candidate);
}
