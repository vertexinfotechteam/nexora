/**
 * Strict typing for values that arrive from a URL.
 *
 * Route parameters are not validated by the framework — `[id]` is whatever was
 * in the path. Handing that straight to the database means Postgres decides
 * what a malformed id is, and its answer is an exception: the id reaches the
 * uuid cast, the cast throws, and the route answers 500. That is wrong twice
 * over. It is an unhandled crash on ordinary bad input, and 500-versus-404
 * tells a prober that their id was at least well-formed enough to be looked
 * up.
 *
 * Checking the shape first turns both cases into the same flat "not found".
 *
 * Pure and dependency-free, so the shapes below can be tested directly.
 */

/** Canonical 8-4-4-4-12 hex form, which is what every id column stores. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * A share token.
 *
 * Generated as URL-safe base64, so anything outside that alphabet was not
 * issued by us and does not need looking up. Bounded at both ends: a one
 * character token is not ours either, and an unbounded one is free work for
 * whoever sends a megabyte.
 */
const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN.test(value);
}

/** The export formats the app actually produces. */
export const EXPORT_FORMATS = ["pdf", "excel"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return (
    typeof value === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

/**
 * Trims a string and enforces a maximum length.
 *
 * Returns null rather than truncating. Silently shortening input means storing
 * something the user did not write, which is worse than refusing it — a
 * half-saved address or a clipped invoice line is a bug that surfaces much
 * later, somewhere else.
 */
export function boundedString(
  value: unknown,
  max: number,
  { min = 1 }: { min?: number } = {},
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Strips characters that have no business in stored text.
 *
 * Removes C0 controls and DEL, but keeps tab, newline and carriage return,
 * because a pasted invoice line or a support message legitimately contains
 * them. This is not an XSS defence — React escapes on render, and that is
 * where the defence belongs. It exists so a control character cannot corrupt
 * a CSV export, a PDF string or a log line further downstream.
 */
export function stripControlChars(value: string): string {
  return value.replace(
    new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]", "g"),
    "",
  );
}
