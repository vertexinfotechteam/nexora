import assert from "node:assert/strict";
import test from "node:test";

import {
  correlation,
  linearTrend,
  mad,
  mape,
  median,
  normalQuantile,
  percentChange,
  quantile,
  rollingMedian,
  stddev,
} from "../src/lib/analysis/stats.ts";
import { detectAnomalies, detectValueOutliers } from "../src/lib/analysis/anomaly.ts";
import { forecastSeries } from "../src/lib/analysis/forecast.ts";

test("median handles even and odd lengths", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("quantile interpolates", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test("stddev matches the sample formula", () => {
  // sample sd of [2,4,4,4,5,5,7,9] is 2.13809...
  assert.ok(Math.abs(stddev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.13809) < 0.0001);
});

test("mad is unaffected by a single extreme value", () => {
  const base = [10, 11, 12, 11, 10, 12, 11];
  const withOutlier = [...base, 5000];
  // Standard deviation explodes; MAD barely moves.
  assert.ok(stddev(withOutlier) > stddev(base) * 50);
  assert.ok(Math.abs(mad(withOutlier) - mad(base)) < 1.5);
});

test("percentChange guards divide-by-zero", () => {
  assert.equal(percentChange(110, 100), 10);
  assert.equal(percentChange(5, 0), null);
});

test("linearTrend recovers a known line", () => {
  const values = [0, 2, 4, 6, 8, 10];
  const { slope, intercept, r2 } = linearTrend(values);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept) < 1e-9);
  assert.ok(Math.abs(r2 - 1) < 1e-9);
});

test("correlation detects perfect relationships", () => {
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [2, 4, 6, 8])! - 1) < 1e-9);
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [8, 6, 4, 2])! + 1) < 1e-9);
  assert.equal(correlation([1, 1, 1, 1], [1, 2, 3, 4]), null);
});

test("rollingMedian smooths a spike", () => {
  const smoothed = rollingMedian([10, 10, 10, 900, 10, 10, 10], 5);
  assert.equal(smoothed[3], 10);
});

test("normalQuantile matches known z values", () => {
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959964) < 1e-4);
  assert.ok(Math.abs(normalQuantile(0.95) - 1.644854) < 1e-4);
});

test("mape ignores zero actuals", () => {
  assert.equal(mape([0, 0], [1, 1]), null);
  assert.ok(Math.abs(mape([100, 200], [110, 180])! - 10) < 1e-9);
});

// ---------------------------------------------------------------------------

test("detectAnomalies finds an injected spike and reports real values", () => {
  const series = Array.from({ length: 30 }, (_, i) => ({
    period: `2025-01-${String(i + 1).padStart(2, "0")}`,
    value: 100 + (i % 3),
  }));
  series[20].value = 460;

  const { anomalies } = detectAnomalies(series);
  assert.equal(anomalies.length >= 1, true);

  const top = anomalies[0];
  assert.equal(top.period, "2025-01-21");
  assert.equal(top.actual, 460);
  assert.equal(top.direction, "spike");
  // Expected value is the local level, not the global mean.
  assert.ok(top.expected >= 99 && top.expected <= 103);
  assert.ok(top.confidence > 0 && top.confidence <= 99);
  assert.ok(["medium", "high", "critical"].includes(top.severity));
});

test("detectAnomalies refuses short series instead of guessing", () => {
  const result = detectAnomalies([
    { period: "a", value: 1 },
    { period: "b", value: 99 },
  ]);
  assert.equal(result.anomalies.length, 0);
  assert.match(result.note!, /at least 8 periods/);
});

test("detectAnomalies stays silent on constant data", () => {
  const flat = Array.from({ length: 20 }, (_, i) => ({
    period: `p${i}`,
    value: 42,
  }));
  const result = detectAnomalies(flat);
  assert.equal(result.anomalies.length, 0);
  assert.match(result.note!, /identical/);
});

test("detectValueOutliers flags extreme records", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    amount: 50 + (i % 5),
  }));
  rows.push({ id: 99, amount: 9000 });

  const { outliers } = detectValueOutliers(rows, "amount");
  assert.equal(outliers.length, 1);
  assert.equal(outliers[0].row.id, 99);
  assert.equal(outliers[0].value, 9000);
});

// ---------------------------------------------------------------------------

test("forecastSeries projects a clean linear trend accurately", () => {
  const series = Array.from({ length: 24 }, (_, i) => ({
    period: `2024-${String((i % 12) + 1).padStart(2, "0")}`,
    value: 1000 + i * 50,
  }));
  // Use real monthly labels so period advancement is exercised.
  const monthly = series.map((_, i) => {
    const d = new Date(Date.UTC(2023, i, 1));
    return { period: d.toISOString().slice(0, 7), value: 1000 + i * 50 };
  });

  const result = forecastSeries(monthly, 3, "month");
  assert.equal(result.points.length, 3);
  // Next value should continue the +50/period trend from 2150.
  assert.ok(Math.abs(result.points[0].value - 2200) < 60);
  assert.ok(result.points[0].lower <= result.points[0].value);
  assert.ok(result.points[0].upper >= result.points[0].value);
  // A deterministic series has no forecast error, so the interval legitimately
  // collapses. The model must disclose that rather than imply certainty.
  assert.match(result.qualityNote!, /perfectly regular/);
  // Labels continue the monthly sequence.
  assert.equal(result.points[0].period, "2025-01");
  assert.equal(result.points[2].period, "2025-03");
});

test("forecast intervals widen with the horizon on noisy data", () => {
  // Deterministic pseudo-noise so the test cannot flake.
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const series = Array.from({ length: 36 }, (_, i) => ({
    period: new Date(Date.UTC(2022, i, 1)).toISOString().slice(0, 7),
    value: 1000 + i * 40 + rand() * 300,
  }));

  const result = forecastSeries(series, 6, "month");
  assert.equal(result.points.length, 6);
  const w1 = result.points[0].upper - result.points[0].lower;
  const w6 = result.points[5].upper - result.points[5].lower;
  assert.ok(w1 > 0, "noisy history must produce a non-zero interval");
  assert.ok(w6 > w1, "interval must widen with the horizon");
  assert.ok(result.mape !== null && result.mape > 0);
});

test("forecastSeries refuses to forecast from too little history", () => {
  const result = forecastSeries(
    [
      { period: "2025-01", value: 10 },
      { period: "2025-02", value: 20 },
    ],
    6,
    "month",
  );
  assert.equal(result.points.length, 0);
  assert.equal(result.model, "none");
  assert.match(result.qualityNote!, /at least 4 periods/);
});

test("forecastSeries picks a seasonal model when seasonality is real", () => {
  // Strong 12-period seasonality plus trend, 4 full cycles.
  const values = Array.from({ length: 48 }, (_, i) =>
    500 + i * 5 + 200 * Math.sin((2 * Math.PI * i) / 12),
  );
  const series = values.map((value, i) => ({
    period: new Date(Date.UTC(2021, i, 1)).toISOString().slice(0, 7),
    value,
  }));

  const result = forecastSeries(series, 6, "month");
  assert.match(result.model, /Holt-Winters/);
  assert.equal(result.points.length, 6);
  assert.ok(result.mape !== null && result.mape < 25);
});
