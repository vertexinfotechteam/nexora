/**
 * Deciding whether an alert has been crossed.
 *
 * Kept apart from the page so it can be tested directly. This is the part that
 * decides whether someone is interrupted, and the two ways it can be wrong are
 * both expensive: a missed breach is the thing the feature exists to prevent,
 * and a false one teaches people to ignore the alert that matters.
 */

export type AlertRow = { label: string; value: number };

export type Breach = {
  triggered: boolean;
  /** The group furthest past the line, which is the one worth naming. */
  worst: AlertRow | null;
  count: number;
};

/**
 * Checks every group against the line, not the total.
 *
 * "Tell me when revenue drops below 50,000" means any region falling below it.
 * Summing first would hide the case worth knowing about — one region
 * collapsing while the others carry the total — which is the failure that
 * makes threshold alerts useless in practice.
 */
export function findBreach(
  rows: AlertRow[],
  comparison: "above" | "below",
  threshold: number,
): Breach {
  /*
   * A non-finite threshold never matches.
   *
   * Every comparison against NaN is false, so a rule that reached here with a
   * bad threshold would silently sit at "within range" forever, which reads as
   * a healthy alert rather than a broken one. Refusing it explicitly keeps
   * that impossible.
   */
  if (!Number.isFinite(threshold)) {
    return { triggered: false, worst: null, count: 0 };
  }

  const breaches = rows.filter((row) =>
    Number.isFinite(row.value) &&
    (comparison === "above" ? row.value > threshold : row.value < threshold),
  );

  if (breaches.length === 0) {
    return { triggered: false, worst: null, count: 0 };
  }

  const worst = breaches.reduce((furthest, row) =>
    comparison === "above"
      ? row.value > furthest.value
        ? row
        : furthest
      : row.value < furthest.value
        ? row
        : furthest,
  );

  return { triggered: true, worst, count: breaches.length };
}
