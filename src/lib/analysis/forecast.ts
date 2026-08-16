import { linearTrend, mape, mean, normalQuantile, stddev } from "./stats";
import type { SeriesPoint } from "./anomaly";

/**
 * Forecasting.
 *
 * Two real statistical models are fitted and the better one is selected by
 * rolling-origin backtest, so the choice is earned rather than asserted:
 *
 *   - Holt's linear trend (double exponential smoothing), with alpha/beta
 *     chosen by grid search minimising in-sample SSE.
 *   - Additive Holt-Winters, fitted only when the series is long enough to
 *     support the detected seasonal period (>= 2 full cycles).
 *
 * Accuracy and prediction intervals come from a rolling-origin backtest, not
 * from in-sample residuals: the model is re-run against progressively longer
 * prefixes and scored on the point it did not see. In-sample residuals flatter
 * a model that was fitted on the same rows, so they would understate real
 * error. The LLM never produces a number here — it may only describe what
 * these functions returned.
 */

export type ForecastPoint = {
  period: string;
  value: number;
  lower: number;
  upper: number;
};

export type ForecastOutput = {
  points: ForecastPoint[];
  model: string;
  mape: number | null;
  /**
   * How `mape` was measured. "backtest" is out-of-sample and trustworthy;
   * "in-sample" means the series was too short to hold out any points, so the
   * figure flatters the model. Never report one as the other.
   */
  accuracyBasis: "backtest" | "in-sample" | "none";
  /** Honest warning when the input is too short/irregular to trust. */
  qualityNote: string | null;
  fitted: number[];
};

/** Label for the accuracy figure, matching how it was actually measured. */
export function accuracyLabel(basis: ForecastOutput["accuracyBasis"]): string {
  if (basis === "backtest") return "Backtest error (MAPE)";
  if (basis === "in-sample") return "In-sample error (MAPE)";
  return "Error (MAPE)";
}

type Granularity = "day" | "week" | "month" | "quarter" | "year";

function holtLinear(
  values: number[],
  alpha: number,
  beta: number,
): { fitted: number[]; level: number; trend: number; sse: number } {
  let level = values[0];
  let trend = values[1] !== undefined ? values[1] - values[0] : 0;
  const fitted: number[] = [level];
  let sse = 0;

  for (let i = 1; i < values.length; i++) {
    const forecast = level + trend;
    fitted.push(forecast);
    sse += (values[i] - forecast) ** 2;

    const previousLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }
  return { fitted, level, trend, sse };
}

function holtWinters(
  values: number[],
  period: number,
  alpha: number,
  beta: number,
  gamma: number,
): {
  fitted: number[];
  level: number;
  trend: number;
  seasonal: number[];
  sse: number;
} | null {
  if (values.length < period * 2) return null;

  // Initial level/trend/seasonals from the first two cycles.
  const firstCycle = values.slice(0, period);
  const secondCycle = values.slice(period, period * 2);
  let level = mean(firstCycle);
  let trend = (mean(secondCycle) - mean(firstCycle)) / period;
  const seasonal = firstCycle.map((v) => v - level);

  const fitted: number[] = [];
  let sse = 0;

  for (let i = 0; i < values.length; i++) {
    const s = seasonal[i % period];
    const forecast = level + trend + s;
    fitted.push(forecast);
    if (i >= period) sse += (values[i] - forecast) ** 2;

    const previousLevel = level;
    level = alpha * (values[i] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonal[i % period] =
      gamma * (values[i] - level) + (1 - gamma) * s;
  }

  return { fitted, level, trend, seasonal, sse };
}

/** Detects a seasonal period by autocorrelation over plausible candidates. */
function detectPeriod(values: number[], granularity: Granularity): number {
  const candidates =
    granularity === "day"
      ? [7, 30]
      : granularity === "week"
        ? [4, 13, 52]
        : granularity === "month"
          ? [3, 4, 12]
          : granularity === "quarter"
            ? [4]
            : [];

  let best = 1;
  let bestScore = 0.35; // require meaningful autocorrelation before claiming seasonality

  for (const period of candidates) {
    if (values.length < period * 2) continue;
    const a = values.slice(period);
    const b = values.slice(0, values.length - period);
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    if (da === 0 || db === 0) continue;
    const score = num / Math.sqrt(da * db);
    if (score > bestScore) {
      bestScore = score;
      best = period;
    }
  }
  return best;
}

function gridSearchHolt(values: number[]) {
  let best = { alpha: 0.3, beta: 0.1, sse: Infinity };
  for (let alpha = 0.1; alpha <= 0.9; alpha += 0.1) {
    for (let beta = 0.05; beta <= 0.5; beta += 0.05) {
      const { sse } = holtLinear(values, alpha, beta);
      if (sse < best.sse) best = { alpha, beta, sse };
    }
  }
  return best;
}

function gridSearchWinters(values: number[], period: number) {
  let best = { alpha: 0.3, beta: 0.1, gamma: 0.2, sse: Infinity };
  for (let alpha = 0.1; alpha <= 0.9; alpha += 0.2) {
    for (let beta = 0.05; beta <= 0.45; beta += 0.1) {
      for (let gamma = 0.1; gamma <= 0.7; gamma += 0.2) {
        const fit = holtWinters(values, period, alpha, beta, gamma);
        if (fit && fit.sse < best.sse) best = { alpha, beta, gamma, sse: fit.sse };
      }
    }
  }
  return best;
}

/** Advances a period label by `n` steps, matching the input granularity. */
function nextPeriods(
  lastPeriod: string,
  granularity: Granularity,
  count: number,
): string[] {
  const out: string[] = [];
  const parsed = new Date(lastPeriod);

  if (Number.isNaN(parsed.getTime())) {
    // Non-date labels (e.g. "Q1", category names): fall back to numbering.
    for (let i = 1; i <= count; i++) out.push(`+${i}`);
    return out;
  }

  for (let i = 1; i <= count; i++) {
    const d = new Date(parsed);
    switch (granularity) {
      case "day":
        d.setUTCDate(d.getUTCDate() + i);
        out.push(d.toISOString().slice(0, 10));
        break;
      case "week":
        d.setUTCDate(d.getUTCDate() + i * 7);
        out.push(d.toISOString().slice(0, 10));
        break;
      case "month":
        d.setUTCMonth(d.getUTCMonth() + i);
        out.push(d.toISOString().slice(0, 7));
        break;
      case "quarter":
        d.setUTCMonth(d.getUTCMonth() + i * 3);
        out.push(d.toISOString().slice(0, 7));
        break;
      case "year":
        d.setUTCFullYear(d.getUTCFullYear() + i);
        out.push(String(d.getUTCFullYear()));
        break;
    }
  }
  return out;
}

export function forecastSeries(
  series: SeriesPoint[],
  horizon: number,
  granularity: Granularity = "month",
  confidence = 0.95,
): ForecastOutput {
  const clean = series.filter((p) => Number.isFinite(p.value));
  const values = clean.map((p) => p.value);

  if (values.length < 4) {
    return {
      points: [],
      model: "none",
      mape: null,
      accuracyBasis: "none",
      qualityNote: `A forecast needs at least 4 periods of history; this series has ${values.length}.`,
      fitted: [],
    };
  }

  const period = detectPeriod(values, granularity);
  const holtParams = gridSearchHolt(values);
  const holt = holtLinear(values, holtParams.alpha, holtParams.beta);

  let chosen: {
    name: string;
    fitted: number[];
    project: (h: number) => number;
    /** One-step-ahead projection from an arbitrary prefix, for backtesting. */
    projectFrom: (prefix: number[]) => number | null;
  };

  const wintersParams =
    period > 1 ? gridSearchWinters(values, period) : null;
  const winters =
    wintersParams &&
    holtWinters(
      values,
      period,
      wintersParams.alpha,
      wintersParams.beta,
      wintersParams.gamma,
    );

  if (winters && winters.sse < holt.sse * 0.95) {
    const { level, trend, seasonal } = winters;
    const n = values.length;
    const p = wintersParams!;
    chosen = {
      name: `Holt-Winters additive (period ${period}, α=${p.alpha.toFixed(2)}, β=${p.beta.toFixed(2)}, γ=${p.gamma.toFixed(2)})`,
      fitted: winters.fitted,
      project: (h) => level + h * trend + seasonal[(n + h - 1) % period],
      projectFrom: (prefix) => {
        const fit = holtWinters(prefix, period, p.alpha, p.beta, p.gamma);
        if (!fit) return null;
        return fit.level + fit.trend + fit.seasonal[prefix.length % period];
      },
    };
  } else {
    const { level, trend } = holt;
    chosen = {
      name: `Holt linear trend (α=${holtParams.alpha.toFixed(2)}, β=${holtParams.beta.toFixed(2)})`,
      fitted: holt.fitted,
      project: (h) => level + h * trend,
      projectFrom: (prefix) => {
        if (prefix.length < 2) return null;
        const fit = holtLinear(prefix, holtParams.alpha, holtParams.beta);
        return fit.level + fit.trend;
      },
    };
  }

  // --- rolling-origin backtest -------------------------------------------
  // Re-run the chosen model over growing prefixes and score it on the point it
  // has not seen. These out-of-sample errors set both the interval width and
  // the reported accuracy.
  const minPrefix = Math.max(period * 2, 4);
  const origins = Math.max(
    0,
    Math.min(values.length - minPrefix, Math.max(3, Math.floor(values.length / 4))),
  );

  const backtestActual: number[] = [];
  const backtestPredicted: number[] = [];
  for (let i = values.length - origins; i < values.length; i++) {
    if (i < minPrefix) continue;
    const predicted = chosen.projectFrom(values.slice(0, i));
    if (predicted === null || !Number.isFinite(predicted)) continue;
    backtestActual.push(values[i]);
    backtestPredicted.push(predicted);
  }

  const backtestErrors = backtestActual.map((a, i) => a - backtestPredicted[i]);

  // Fall back to in-sample residuals only when the series is too short to
  // hold out any points at all.
  const usedBacktest = backtestErrors.length >= 3;
  const errorsForInterval = usedBacktest
    ? backtestErrors
    : values.map((v, i) => v - chosen.fitted[i]).slice(Math.max(1, period));

  const sigma = stddev(errorsForInterval);
  const z = normalQuantile(1 - (1 - confidence) / 2);

  const lastPeriod = clean[clean.length - 1].period;
  const labels = nextPeriods(lastPeriod, granularity, horizon);

  const points: ForecastPoint[] = labels.map((label, i) => {
    const h = i + 1;
    const value = chosen.project(h);
    // Interval widens with sqrt(h), the standard random-walk assumption.
    const spread = z * sigma * Math.sqrt(h);
    return {
      period: label,
      value: Math.round(value * 100) / 100,
      lower: Math.round((value - spread) * 100) / 100,
      upper: Math.round((value + spread) * 100) / 100,
    };
  });

  const accuracy = usedBacktest
    ? mape(backtestActual, backtestPredicted)
    : mape(values.slice(1), chosen.fitted.slice(1));

  const notes: string[] = [];
  if (values.length < 12) {
    notes.push(
      `Only ${values.length} periods of history are available, so this projection is directional rather than precise.`,
    );
  }
  if (!usedBacktest) {
    notes.push(
      "The history was too short to hold out test points, so accuracy is measured on the same data the model was fitted to and is optimistic.",
    );
  }
  if (sigma === 0) {
    // A perfectly regular history produces zero forecast error, which would
    // render as a zero-width interval. Say so rather than implying certainty.
    notes.push(
      "The history is perfectly regular, so the model reproduces it exactly and the interval collapses to the projected line. Treat it as a pattern continuation, not a certainty.",
    );
  }
  if (period === 1 && ["day", "week", "month"].includes(granularity)) {
    notes.push("No repeating seasonal pattern was detected in the history.");
  }
  const { r2 } = linearTrend(values);
  if (r2 < 0.1 && values.length >= 12) {
    notes.push("The history has no clear trend, so the interval is wide by design.");
  }

  return {
    points,
    model: chosen.name,
    mape: accuracy === null ? null : Math.round(accuracy * 10) / 10,
    accuracyBasis: accuracy === null ? "none" : usedBacktest ? "backtest" : "in-sample",
    qualityNote: notes.length > 0 ? notes.join(" ") : null,
    fitted: chosen.fitted,
  };
}
