/**
 * AI result integrity.
 *
 * The spec's rule is absolute: every number shown to the user must come from
 * actual computation. This module is the enforcement point. It extracts every
 * numeric claim from model-written prose and checks it against the set of
 * figures the analytics engine actually produced.
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

export type VerifiedFigure = {
  label: string;
  /** The engine-computed value. */
  value: number | string;
};

export type NumericClaim = {
  /** The number exactly as it appeared in the text. */
  raw: string;
  /** Parsed numeric value. */
  value: number;
  /** Character offset in the narrative, for highlighting. */
  index: number;
  /** True when the figure was matched to a computed value. */
  verified: boolean;
};

export type VerificationResult = {
  ok: boolean;
  claims: NumericClaim[];
  unverified: NumericClaim[];
};

/**
 * Matches numbers with optional sign, thousands separators, decimals, an
 * optional magnitude suffix (k/m/bn) and an optional trailing % — i.e. the
 * shapes a model actually writes: 1,234.5  -12%  $4.2M  0.83
 */
const NUMBER_PATTERN =
  /-?\d[\d,  ]*(?:\.\d+)?\s*(?:%|k\b|m\b|bn?\b|thousand\b|million\b|billion\b)?/gi;

const MAGNITUDES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

function parseClaim(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const suffixMatch = trimmed.match(/(k|m|bn?|thousand|million|billion)$/);
  const numericPart = trimmed
    .replace(/(k|m|bn?|thousand|million|billion)$/, "")
    .replace(/%$/, "")
    .replace(/[,  \s]/g, "");

  const parsed = Number(numericPart);
  if (!Number.isFinite(parsed)) return null;

  const multiplier = suffixMatch ? (MAGNITUDES[suffixMatch[1]] ?? 1) : 1;
  return parsed * multiplier;
}

/** Extracts every number the engine produced, including nested structures. */
export function collectComputedValues(
  figures: VerifiedFigure[],
  extra: unknown[] = [],
): number[] {
  const values: number[] = [];

  const push = (candidate: unknown): void => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      values.push(candidate);
      return;
    }
    if (typeof candidate === "string") {
      // A formatted figure like "$1,234.50" or "18.6%" still carries its number.
      const matches = candidate.match(NUMBER_PATTERN);
      for (const match of matches ?? []) {
        const parsed = parseClaim(match);
        if (parsed !== null) values.push(parsed);
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(push);
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.values(candidate as Record<string, unknown>).forEach(push);
    }
  };

  figures.forEach((figure) => push(figure.value));
  extra.forEach(push);
  return values;
}

/**
 * True when `claim` matches a computed value.
 *
 * Tolerance exists because a model legitimately writes 18.6% for 18.63…% and
 * $1.2M for 1,234,567. It is relative (0.5%) with a small absolute floor, so
 * large figures are not held to impossible precision while small ones cannot
 * drift into a different number.
 */
function matches(claim: number, computed: number): boolean {
  if (claim === computed) return true;
  const scale = Math.max(Math.abs(claim), Math.abs(computed));
  const tolerance = Math.max(scale * 0.005, 0.01);
  if (Math.abs(claim - computed) <= tolerance) return true;

  // A model may write a ratio as a percentage (0.186 -> 18.6%) or vice versa.
  if (Math.abs(claim - computed * 100) <= Math.max(Math.abs(computed * 100) * 0.005, 0.01)) {
    return true;
  }
  if (Math.abs(claim * 100 - computed) <= Math.max(Math.abs(computed) * 0.005, 0.01)) {
    return true;
  }
  return false;
}

/**
 * Numbers that are part of ordinary prose rather than a data claim: small
 * counts ("the top 3 products", "two categories") and four-digit years. These
 * are only exempt when they are NOT attached to a currency or percent marker.
 */
function isProseNumber(raw: string, value: number): boolean {
  const decorated = /[%$£€¥]/.test(raw) || /\d[,.]\d/.test(raw);
  if (decorated) return false;
  if (Number.isInteger(value) && value >= 0 && value <= 12) return true;
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return true;
  return false;
}

export function verifyNarrative(
  narrative: string,
  figures: VerifiedFigure[],
  extraComputed: unknown[] = [],
  question = "",
): VerificationResult {
  const computed = collectComputedValues(figures, extraComputed);
  // Numbers the user themselves supplied are fair to repeat back.
  const fromQuestion = (question.match(NUMBER_PATTERN) ?? [])
    .map(parseClaim)
    .filter((v): v is number => v !== null);

  const claims: NumericClaim[] = [];
  for (const match of narrative.matchAll(NUMBER_PATTERN)) {
    const raw = match[0].trim();
    if (!raw) continue;
    const value = parseClaim(raw);
    if (value === null) continue;

    const verified =
      isProseNumber(raw, value) ||
      computed.some((c) => matches(value, c)) ||
      fromQuestion.some((c) => matches(value, c));

    claims.push({ raw, value, index: match.index ?? 0, verified });
  }

  const unverified = claims.filter((claim) => !claim.verified);
  return { ok: unverified.length === 0, claims, unverified };
}

/**
 * Builds a narrative from verified figures alone. Used when the model's prose
 * fails verification, so the user still gets an answer — one that cannot
 * contain an invented number because no model wrote it.
 */
export function deterministicNarrative(
  question: string,
  figures: VerifiedFigure[],
  rowCount: number,
): string {
  if (figures.length === 0) {
    return `The analysis ran against your data and returned ${rowCount.toLocaleString()} ${
      rowCount === 1 ? "row" : "rows"
    }. The results are shown below.`;
  }

  const headline = figures
    .slice(0, 3)
    .map((figure) => `${figure.label}: ${figure.value}`)
    .join(", ");

  return `Here is what the engine computed for "${question.trim().replace(/\?+$/, "")}" — ${headline}. All figures come directly from your dataset; the full result is shown below.`;
}
