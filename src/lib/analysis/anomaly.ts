import { mad, median, percentChange, rollingMedian } from "./stats";

/**
 * Anomaly detection over a time series.
 *
 * Method: seasonal-naive-free robust decomposition.
 *   1. A centred rolling median gives the expected level at each point —
 *      robust to the spikes we are looking for, unlike a moving average.
 *   2. Residuals are scaled by the MAD of all residuals, giving a robust
 *      z-score that a handful of extreme points cannot inflate.
 *   3. Points beyond the threshold are reported with their real expected value,
 *      real deviation, and a confidence derived from |z|.
 *
 * Nothing here is model-generated. The AI layer may only narrate these values.
 */

export type SeriesPoint = { period: string; value: number };

export type DetectedAnomaly = {
  period: string;
  actual: number;
  expected: number;
  deviationPct: number | null;
  zScore: number;
  direction: "spike" | "drop";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  method: string;
};

export type AnomalyOptions = {
  /** Robust z threshold. 3.0 ≈ the classic 3-sigma rule. */
  threshold?: number;
  /** Rolling window used for the expected level. */
  window?: number;
  /** Cap on how many anomalies to return, strongest first. */
  limit?: number;
};

function severityFor(z: number): DetectedAnomaly["severity"] {
  const a = Math.abs(z);
  if (a >= 6) return "critical";
  if (a >= 4.5) return "high";
  if (a >= 3.5) return "medium";
  return "low";
}

/**
 * Confidence that a point is genuinely anomalous, expressed 0-100.
 * Derived from the robust z-score, saturating at z = 8 so it never reads 100%.
 */
function confidenceFor(z: number): number {
  const a = Math.min(Math.abs(z), 8);
  return Math.round(Math.min(99, (a / 8) * 100));
}

export function detectAnomalies(
  series: SeriesPoint[],
  options: AnomalyOptions = {},
): { anomalies: DetectedAnomaly[]; note: string | null } {
  const threshold = options.threshold ?? 3;
  const limit = options.limit ?? 12;

  const clean = series.filter((p) => Number.isFinite(p.value));
  if (clean.length < 8) {
    return {
      anomalies: [],
      note: `Anomaly detection needs at least 8 periods; this series has ${clean.length}.`,
    };
  }

  const window = options.window ?? Math.max(5, Math.min(15, Math.floor(clean.length / 4) * 2 + 1));
  const values = clean.map((p) => p.value);
  const expected = rollingMedian(values, window);
  const residuals = values.map((v, i) => v - expected[i]);

  const scale = mad(residuals);
  if (scale === 0) {
    // A perfectly flat residual series means either constant data or too few
    // distinct values for this method to say anything useful.
    const allSame = new Set(values).size === 1;
    return {
      anomalies: [],
      note: allSame
        ? "Every value in this series is identical, so there is nothing to flag."
        : "The series is too regular for robust anomaly detection to separate signal from noise.",
    };
  }

  const found: DetectedAnomaly[] = [];
  for (let i = 0; i < clean.length; i++) {
    const z = residuals[i] / scale;
    if (Math.abs(z) < threshold) continue;

    found.push({
      period: clean[i].period,
      actual: values[i],
      expected: expected[i],
      deviationPct: percentChange(values[i], expected[i]),
      zScore: Math.round(z * 100) / 100,
      direction: z > 0 ? "spike" : "drop",
      severity: severityFor(z),
      confidence: confidenceFor(z),
      method: `Rolling-median residual, MAD-scaled (window ${window}, threshold ${threshold}σ)`,
    });
  }

  found.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return {
    anomalies: found.slice(0, limit),
    note:
      found.length === 0
        ? `No points deviated more than ${threshold}σ from the local level across ${clean.length} periods.`
        : null,
  };
}

/**
 * Flags individual records whose numeric value is extreme relative to the
 * column as a whole. Used for the "find unusual transactions" question, where
 * there is no time dimension to decompose.
 */
export function detectValueOutliers(
  rows: Record<string, unknown>[],
  valueKey: string,
  options: { threshold?: number; limit?: number } = {},
): {
  outliers: { row: Record<string, unknown>; value: number; zScore: number }[];
  centre: number;
  scale: number;
} {
  const threshold = options.threshold ?? 3.5;
  const limit = options.limit ?? 25;

  const numeric = rows
    .map((row) => ({ row, value: Number(row[valueKey]) }))
    .filter((r) => Number.isFinite(r.value));

  const values = numeric.map((r) => r.value);
  const centre = median(values);
  const scale = mad(values);
  if (scale === 0) return { outliers: [], centre, scale };

  const outliers = numeric
    .map((r) => ({ ...r, zScore: (r.value - centre) / scale }))
    .filter((r) => Math.abs(r.zScore) >= threshold)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, limit)
    .map((r) => ({
      row: r.row,
      value: r.value,
      zScore: Math.round(r.zScore * 100) / 100,
    }));

  return { outliers, centre, scale };
}
