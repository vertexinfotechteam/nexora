import assert from "node:assert/strict";
import test from "node:test";

import { findBreach } from "../src/lib/alerts/evaluate.ts";

/**
 * Whether an alert fires.
 *
 * Both ways this can be wrong are expensive: a missed breach is the thing the
 * feature exists to prevent, and a false one teaches people to ignore the
 * alert that matters. These cases pin the boundary and the awkward values.
 */

const rows = [
  { label: "North", value: 90_000 },
  { label: "South", value: 42_000 },
  { label: "East", value: 8_000 },
  { label: "West", value: 61_000 },
];

test("fires when any single group is below the line, not the total", () => {
  // The total here is 201,000 — far above the line. Summing first would call
  // this healthy and hide East entirely.
  const breach = findBreach(rows, "below", 50_000);
  assert.equal(breach.triggered, true);
  assert.equal(breach.count, 2, "South and East are both under");
});

test("names the group furthest past the line", () => {
  // East, not South: the worst offender is the one worth putting in the row.
  assert.equal(findBreach(rows, "below", 50_000).worst?.label, "East");
  assert.equal(findBreach(rows, "above", 50_000).worst?.label, "North");
});

test("stays quiet when every group is within range", () => {
  const breach = findBreach(rows, "below", 1_000);
  assert.deepEqual(breach, { triggered: false, worst: null, count: 0 });
});

test("the threshold itself is not a breach", () => {
  // Strictly below / strictly above. "Alert when below 8,000" must not fire on
  // a value of exactly 8,000, or every alert set to a round number fires the
  // moment the data lands on it.
  assert.equal(findBreach([{ label: "East", value: 8_000 }], "below", 8_000).triggered, false);
  assert.equal(findBreach([{ label: "East", value: 8_000 }], "above", 8_000).triggered, false);
  assert.equal(findBreach([{ label: "East", value: 7_999 }], "below", 8_000).triggered, true);
});

test("negative values are compared as numbers, not magnitudes", () => {
  // A loss of -5,000 is below zero. Comparing absolute values here would call
  // the worst case healthy.
  const breach = findBreach([{ label: "Q3", value: -5_000 }], "below", 0);
  assert.equal(breach.triggered, true);
  assert.equal(breach.worst?.value, -5_000);
});

test("no rows means nothing to fire on", () => {
  assert.deepEqual(findBreach([], "below", 100), { triggered: false, worst: null, count: 0 });
});

test("a broken threshold refuses rather than sitting silently healthy", () => {
  // Every comparison against NaN is false, so without the guard this would
  // read as "within range" forever — a broken alert that looks like a working
  // one, which is worse than an error.
  assert.equal(findBreach(rows, "below", Number.NaN).triggered, false);
  assert.equal(findBreach(rows, "below", Number.NaN).count, 0);
});

test("a non-numeric row value is skipped, not counted as a breach", () => {
  const withGap = [...rows, { label: "Unknown", value: Number.NaN }];
  assert.equal(findBreach(withGap, "below", 50_000).count, 2, "the NaN row must not count");
});
