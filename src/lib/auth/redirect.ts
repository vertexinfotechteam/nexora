/**
 * Redirect-target validation.
 *
 * Pure and dependency-free so the rules below can be unit-tested directly
 * rather than inferred from the handlers that apply them.
 */

/** Routes that no longer exist but may still be bookmarked or linked. */
const RETIRED_PATHS = ["/onboarding"];

/**
 * Any C0 control character, or DEL.
 *
 * Built from an escape string rather than written as literal bytes: pasting
 * the raw characters into the source turns this file binary, and diffs and
 * greps stop working on it.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

/**
 * Reduces an untrusted `next` value to a safe same-origin path.
 *
 * `next` reaches us from a query string or a form field, so it is entirely
 * attacker-controlled. Checking only for a leading "/" is not enough:
 * "//evil.com" and "/\evil.com" are both read by browsers as protocol-relative
 * URLs and navigate off the site, which turns the sign-in page into a
 * convincing springboard for phishing — the victim really did start on the
 * genuine login screen.
 *
 * Anything not recognised as a plain in-app path becomes the dashboard.
 */
export function safeNextPath(
  candidate: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!candidate) return fallback;

  const value = candidate.trim();
  if (!value.startsWith("/")) return fallback;

  // Protocol-relative in both spellings; browsers normalise backslashes.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // A control character can be used to break a parser's idea of where the path
  // ends, so refuse the whole value rather than trying to clean it.
  if (CONTROL_CHARS.test(value)) return fallback;

  // No backslash belongs in a path this app generates.
  if (value.includes("\\")) return fallback;

  const path = value.split(/[?#]/)[0];
  if (
    RETIRED_PATHS.some(
      (retired) => path === retired || path.startsWith(`${retired}/`),
    )
  ) {
    return fallback;
  }

  return value;
}

/**
 * Chooses the origin used to build links that are emailed to a user
 * (confirmation, password reset, OAuth return).
 *
 * The request's `Origin` header cannot be used for this. It is set by the
 * caller, so an attacker can post the forgot-password form with an origin they
 * control and the recovery link mailed to the victim would point at their
 * site, handing over the token. A configured site URL is the only value that
 * is not attacker-supplied.
 *
 * `requestOrigin` is accepted as a fallback for local development, where no
 * site URL is configured and there is nobody to attack.
 */
export function resolveSiteOrigin(
  configuredSiteUrl: string | undefined,
  requestOrigin: string | null | undefined,
  isProduction: boolean,
): string {
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).origin;
    } catch {
      // Fall through rather than emitting a broken link.
    }
  }

  // In production an unconfigured site URL is a deployment mistake, but
  // emailing a link built from an attacker's header is worse than emailing
  // none, so the caller gets an empty string and Supabase falls back to the
  // Site URL configured in its own dashboard.
  if (isProduction) return "";

  return requestOrigin ?? "";
}
