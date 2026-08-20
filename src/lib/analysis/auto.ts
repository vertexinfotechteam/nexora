import "server-only";

import { DATASET_TABLE, quoteIdent, runQuery } from "@/lib/duckdb/engine";
import { truncTemporal } from "./date-sql";
import { formatNumber } from "@/lib/utils";
import { detectAnomalies } from "./anomaly";
import { accuracyLabel, forecastSeries } from "./forecast";
import { selectChart } from "./chart";
import { linearTrend, percentChange } from "./stats";
import type {
  Anomaly,
  ChartSpec,
  DatasetColumn,
  DatasetProfile,
  DatasetQuality,
  Forecast,
  Recommendation,
} from "@/lib/store/types";

/**
 * The automatic analysis.
 *
 * Given only a dataset, this works out what the data is about and computes a
 * standard analytical pass over it: headline measures, movement over time,
 * composition by the strongest dimension, anomalies, a forecast, and
 * recommendations. Every output is computed here; the AI layer only narrates.
 *
 * This is what makes "give a task and get a full result" possible even when the
 * question is vague — and what fills the PDF report.
 */

export type Kpi = {
  label: string;
  value: number;
  formatted: string;
  previous: number | null;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  /** Whether an increase is good. Churn going up is bad; revenue going up is good. */
  positiveIsGood: boolean;
  sparkline: { period: string; value: number }[];
};

export type AutoAnalysis = {
  dateColumn: DatasetColumn | null;
  primaryMeasure: DatasetColumn | null;
  granularity: "day" | "week" | "month" | "quarter";
  periodStart: string | null;
  periodEnd: string | null;
  kpis: Kpi[];
  timeSeries: {
    spec: ChartSpec;
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
  } | null;
  breakdowns: {
    spec: ChartSpec;
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
  }[];
  anomalies: Omit<Anomaly, "id" | "organization_id" | "created_at">[];
  forecast: Omit<Forecast, "id" | "organization_id" | "created_at"> | null;
  recommendations: Omit<Recommendation, "id" | "organization_id" | "created_at">[];
  /** Every figure computed here, for narrative verification. */
  figures: { label: string; value: string }[];
};

const INVERSE_METRICS = /(churn|cancel|refund|return|bounce|complaint|defect|error|loss|cost|attrition)/i;

/**
 * Measures that are NOT additive: summing them produces a meaningless number.
 * A total of "unit price" or "satisfaction score" says nothing; the average
 * does. Detected by name because the data type cannot distinguish them.
 */
const NON_ADDITIVE =
  /(^|_)(price|rate|ratio|pct|percent|percentage|score|rating|avg|average|mean|median|margin|share|index|level|temperature|age|weight|height|balance|per_[a-z]+)($|_)/i;

export type Aggregate = "sum" | "avg";

export function aggregateFor(column: DatasetColumn): Aggregate {
  return NON_ADDITIVE.test(column.name) ? "avg" : "sum";
}

function aggregateSql(column: DatasetColumn): string {
  const id = quoteIdent(column.name);
  return aggregateFor(column) === "avg" ? `avg(${id})` : `sum(${id})`;
}

/** Human-readable KPI label reflecting how the measure was aggregated. */
function measureLabel(column: DatasetColumn): string {
  return aggregateFor(column) === "avg"
    ? `Average ${column.name}`
    : `Total ${column.name}`;
}

/**
 * Priority tiers for choosing the headline measure. Revenue-like columns beat
 * per-unit prices, which beat generic counts. Without this, a dataset with both
 * "revenue" and "unit_price" could headline the wrong one.
 */
const MEASURE_TIERS: RegExp[] = [
  /(^|_)(revenue|sales|gmv|turnover|bookings|income)($|_)/i,
  /(^|_)(amount|total|profit|margin_value|spend|cost)($|_)/i,
  /(^|_)(quantity|units|orders|count|sessions|users|clicks|visits)($|_)/i,
  /(^|_)(price|value)($|_)/i,
];

function measureRank(column: DatasetColumn): number {
  const tier = MEASURE_TIERS.findIndex((pattern) => pattern.test(column.name));
  if (tier >= 0) return tier;
  // Additive unknowns still beat non-additive ones as a headline figure.
  return aggregateFor(column) === "sum" ? MEASURE_TIERS.length : MEASURE_TIERS.length + 1;
}

function pickDateColumn(columns: DatasetColumn[]): DatasetColumn | null {
  const dates = columns.filter((c) => c.semantic_type === "date");
  if (dates.length === 0) return null;
  // Prefer a column that reads like the event date rather than a created/updated stamp.
  const preferred = dates.find((c) =>
    /(order|transaction|event|sale|purchase|invoice|activity|date)$/i.test(c.name),
  );
  return preferred ?? dates[0];
}

function pickMeasures(
  columns: DatasetColumn[],
  profiles: Map<string, DatasetProfile>,
): DatasetColumn[] {
  return columns
    .filter((c) => c.semantic_type === "measure")
    .filter((c) => {
      const profile = profiles.get(c.name);
      // A measure that is entirely null or constant tells us nothing.
      return !profile || (profile.distinct_count ?? 2) > 1;
    })
    .sort((a, b) => measureRank(a) - measureRank(b))
    .slice(0, 5);
}

function pickDimensions(
  columns: DatasetColumn[],
  profiles: Map<string, DatasetProfile>,
): DatasetColumn[] {
  return columns
    .filter((c) => c.semantic_type === "dimension")
    .filter((c) => {
      const distinct = profiles.get(c.name)?.distinct_count ?? 0;
      return distinct >= 2 && distinct <= 60;
    })
    .slice(0, 3);
}

/** Chooses a period size that yields a usable number of points. */
function pickGranularity(spanDays: number): "day" | "week" | "month" | "quarter" {
  if (spanDays <= 90) return "day";
  if (spanDays <= 365) return "week";
  if (spanDays <= 365 * 4) return "month";
  return "quarter";
}

export async function runAutoAnalysis(
  engineKey: string,
  datasetId: string,
  columns: DatasetColumn[],
  profileList: DatasetProfile[],
  quality: DatasetQuality | null,
  onProgress?: (message: string, detail?: string) => void,
): Promise<AutoAnalysis> {
  const profiles = new Map(profileList.map((p) => [p.column_name, p]));
  const dateColumn = pickDateColumn(columns);
  const measures = pickMeasures(columns, profiles);
  const dimensions = pickDimensions(columns, profiles);
  const figures: { label: string; value: string }[] = [];

  const result: AutoAnalysis = {
    dateColumn,
    primaryMeasure: measures[0] ?? null,
    granularity: "month",
    periodStart: null,
    periodEnd: null,
    kpis: [],
    timeSeries: null,
    breakdowns: [],
    anomalies: [],
    forecast: null,
    recommendations: [],
    figures,
  };

  // --- time span ----------------------------------------------------------
  if (dateColumn) {
    const span = await runQuery(
      engineKey,
      `select min(${quoteIdent(dateColumn.name)})::varchar as lo,
              max(${quoteIdent(dateColumn.name)})::varchar as hi,
              date_diff('day', min(${quoteIdent(dateColumn.name)}), max(${quoteIdent(dateColumn.name)})) as span
       from ${DATASET_TABLE}`,
    );
    const row = span.rows[0] ?? {};
    result.periodStart = row.lo ? String(row.lo).slice(0, 10) : null;
    result.periodEnd = row.hi ? String(row.hi).slice(0, 10) : null;
    result.granularity = pickGranularity(Number(row.span) || 0);
    onProgress?.(
      `Data covers ${result.periodStart ?? "?"} to ${result.periodEnd ?? "?"}`,
      `analysing by ${result.granularity}`,
    );
  }

  // --- KPIs ---------------------------------------------------------------
  if (measures.length > 0) {
    onProgress?.(`Computing ${measures.length} headline measure${measures.length === 1 ? "" : "s"}`);

    for (const measure of measures) {
      const totalResult = await runQuery(
        engineKey,
        `select ${aggregateSql(measure)}::double as total from ${DATASET_TABLE}`,
      );
      const total = Number(totalResult.rows[0]?.total);
      if (!Number.isFinite(total)) continue;

      let previous: number | null = null;
      let changePct: number | null = null;
      let sparkline: { period: string; value: number }[] = [];

      if (dateColumn) {
        const seriesResult = await runQuery(
          engineKey,
          `select ${truncTemporal(quoteIdent(dateColumn.name), result.granularity)}::date as period,
                  ${aggregateSql(measure)}::double as total
           from ${DATASET_TABLE}
           where ${quoteIdent(dateColumn.name)} is not null
           group by 1 order by 1`,
        );
        sparkline = seriesResult.rows
          .map((r) => ({
            period: String(r.period ?? "").slice(0, 10),
            value: Number(r.total),
          }))
          .filter((p) => p.period && Number.isFinite(p.value));

        if (sparkline.length >= 2) {
          const current = sparkline[sparkline.length - 1].value;
          previous = sparkline[sparkline.length - 2].value;
          changePct = percentChange(current, previous);
        }
      }

      const positiveIsGood = !INVERSE_METRICS.test(measure.name);
      const kpi: Kpi = {
        label: measureLabel(measure),
        value: total,
        formatted: formatNumber(total),
        previous,
        changePct,
        direction:
          changePct === null || Math.abs(changePct) < 0.05
            ? "flat"
            : changePct > 0
              ? "up"
              : "down",
        positiveIsGood,
        sparkline: sparkline.slice(-24),
      };
      result.kpis.push(kpi);

      figures.push({ label: measureLabel(measure), value: formatNumber(total) });
      if (changePct !== null) {
        figures.push({
          label: `${measure.name} change vs previous ${result.granularity}`,
          value: `${changePct.toFixed(1)}%`,
        });
      }
    }
  }

  // --- primary time series ------------------------------------------------
  const primary = result.primaryMeasure;
  if (dateColumn && primary) {
    onProgress?.(`Building the ${primary.name} trend over time`);

    const seriesResult = await runQuery(
      engineKey,
      `select ${truncTemporal(quoteIdent(dateColumn.name), result.granularity)}::date::varchar as period,
              ${aggregateSql(primary)}::double as ${quoteIdent(primary.name)}
       from ${DATASET_TABLE}
       where ${quoteIdent(dateColumn.name)} is not null
       group by 1 order by 1`,
    );

    result.timeSeries = {
      spec: selectChart({
        columns: seriesResult.columns,
        rows: seriesResult.rows,
        question: `${primary.name} over time`,
      }),
      columns: seriesResult.columns,
      rows: seriesResult.rows,
    };

    const series = seriesResult.rows
      .map((r) => ({
        period: String(r.period ?? "").slice(0, 10),
        value: Number(r[primary.name]),
      }))
      .filter((p) => p.period && Number.isFinite(p.value));

    // --- trend ------------------------------------------------------------
    if (series.length >= 3) {
      const { slope, r2 } = linearTrend(series.map((p) => p.value));
      const first = series[0].value;
      const last = series[series.length - 1].value;
      const overall = percentChange(last, first);
      if (overall !== null) {
        figures.push({
          label: `${primary.name} change across the full period`,
          value: `${overall.toFixed(1)}%`,
        });
      }
      if (r2 >= 0.3) {
        figures.push({
          label: `${primary.name} trend per ${result.granularity}`,
          value: formatNumber(slope),
        });
      }
    }

    // --- anomalies --------------------------------------------------------
    onProgress?.(`Scanning ${series.length} periods for anomalies`);
    const { anomalies } = detectAnomalies(series);
    result.anomalies = anomalies.map((anomaly) => ({
      dataset_id: datasetId,
      job_id: null,
      metric: primary.name,
      dimension: null,
      occurred_on: anomaly.period,
      actual_value: anomaly.actual,
      expected_value: anomaly.expected,
      deviation_pct: anomaly.deviationPct,
      z_score: anomaly.zScore,
      severity: anomaly.severity,
      direction: anomaly.direction,
      method: anomaly.method,
      confidence: anomaly.confidence,
      explanation: null,
    }));
    for (const anomaly of anomalies.slice(0, 5)) {
      figures.push({
        label: `${primary.name} on ${anomaly.period}`,
        value: formatNumber(anomaly.actual),
      });
      figures.push({
        label: `${primary.name} expected on ${anomaly.period}`,
        value: formatNumber(anomaly.expected),
      });
      if (anomaly.deviationPct !== null) {
        figures.push({
          label: `Deviation on ${anomaly.period}`,
          value: `${anomaly.deviationPct.toFixed(1)}%`,
        });
      }
    }

    // --- forecast ---------------------------------------------------------
    const horizon = result.granularity === "day" ? 14 : result.granularity === "week" ? 8 : 3;
    onProgress?.(`Forecasting ${primary.name} ${horizon} ${result.granularity}s ahead`);

    const forecastGranularity =
      result.granularity === "quarter" ? "quarter" : result.granularity;
    const forecast = forecastSeries(series, horizon, forecastGranularity);
    if (forecast.points.length > 0) {
      result.forecast = {
        dataset_id: datasetId,
        job_id: null,
        metric: primary.name,
        horizon,
        granularity: result.granularity,
        model: forecast.model,
        mape: forecast.mape,
        accuracy_basis: forecast.accuracyBasis,
        history: series,
        points: forecast.points,
        data_quality_note: forecast.qualityNote,
      };
      for (const point of forecast.points.slice(0, 4)) {
        figures.push({
          label: `${primary.name} forecast ${point.period}`,
          value: formatNumber(point.value),
        });
      }
      if (forecast.mape !== null) {
        figures.push({
          label: accuracyLabel(forecast.accuracyBasis),
          value: `${forecast.mape}%`,
        });
      }
    }
  }

  // --- breakdowns ---------------------------------------------------------
  if (primary && dimensions.length > 0) {
    onProgress?.(`Breaking ${primary.name} down by ${dimensions.map((d) => d.name).join(", ")}`);

    for (const dimension of dimensions) {
      const breakdown = await runQuery(
        engineKey,
        `select ${quoteIdent(dimension.name)}::varchar as ${quoteIdent(dimension.name)},
                ${aggregateSql(primary)}::double as ${quoteIdent(primary.name)}
         from ${DATASET_TABLE}
         where ${quoteIdent(dimension.name)} is not null
         group by 1 order by 2 desc limit 12`,
        { maxRows: 12 },
      );
      if (breakdown.rows.length === 0) continue;

      result.breakdowns.push({
        spec: selectChart({
          columns: breakdown.columns,
          rows: breakdown.rows,
          question: `${primary.name} by ${dimension.name}`,
        }),
        columns: breakdown.columns,
        rows: breakdown.rows,
      });

      const top = breakdown.rows[0];
      const topValue = Number(top[primary.name]);
      if (Number.isFinite(topValue)) {
        figures.push({
          label: `Top ${dimension.name} by ${primary.name}`,
          value: `${String(top[dimension.name])} (${formatNumber(topValue)})`,
        });
      }
    }
  }

  // --- recommendations ----------------------------------------------------
  result.recommendations = buildRecommendations(result, quality, datasetId);

  return result;
}

/**
 * Recommendations are derived from measured facts only. Each one carries the
 * evidence that produced it, so a reader can check the reasoning.
 */
function buildRecommendations(
  analysis: AutoAnalysis,
  quality: DatasetQuality | null,
  datasetId: string,
): Omit<Recommendation, "id" | "organization_id" | "created_at">[] {
  const out: Omit<Recommendation, "id" | "organization_id" | "created_at">[] = [];
  const primary = analysis.primaryMeasure;

  // 1. Concentration risk from the strongest breakdown.
  // Only meaningful for additive measures — "share of total average price" is
  // not a real quantity, so the check is skipped for averaged measures.
  const breakdown = analysis.breakdowns[0];
  if (
    breakdown &&
    primary &&
    aggregateFor(primary) === "sum" &&
    breakdown.rows.length >= 3
  ) {
    const dimensionKey = breakdown.spec.xKey;
    const values = breakdown.rows.map((r) => Number(r[primary.name])).filter(Number.isFinite);
    const total = values.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const topShare = (values[0] / total) * 100;
      if (topShare >= 40) {
        out.push({
          dataset_id: datasetId,
          job_id: null,
          title: `${String(breakdown.rows[0][dimensionKey])} accounts for most of your ${primary.name}`,
          body: `A single ${dimensionKey} contributes ${topShare.toFixed(1)}% of total ${primary.name} across the ${breakdown.rows.length} shown. That concentration means a change in this one area moves the whole number. Consider whether the exposure is intentional, and what the plan is if it declines.`,
          evidence: [
            { label: `Top ${dimensionKey}`, value: String(breakdown.rows[0][dimensionKey]) },
            { label: "Share of total", value: `${topShare.toFixed(1)}%` },
            { label: `Its ${primary.name}`, value: formatNumber(values[0]) },
            {
              // Column names are user data, so never append a naive "s".
              label: `Total across the ${breakdown.rows.length} shown`,
              value: formatNumber(total),
            },
          ],
          impact: topShare >= 60 ? "High" : "Medium",
          confidence: 90,
          status: "open",
        });
      }
    }
  }

  // 2. Direction of travel on the primary measure.
  const kpi = analysis.kpis[0];
  if (kpi && kpi.changePct !== null && Math.abs(kpi.changePct) >= 5) {
    const improving = kpi.positiveIsGood ? kpi.changePct > 0 : kpi.changePct < 0;
    out.push({
      dataset_id: datasetId,
      job_id: null,
      title: improving
        ? `${kpi.label} is moving in the right direction`
        : `${kpi.label} needs attention`,
      body: improving
        ? `${kpi.label} changed ${kpi.changePct.toFixed(1)}% versus the previous ${analysis.granularity}, from ${formatNumber(kpi.previous ?? 0)} to ${formatNumber(kpi.sparkline[kpi.sparkline.length - 1]?.value ?? 0)}. Identify what changed in that period and whether it can be repeated.`
        : `${kpi.label} changed ${kpi.changePct.toFixed(1)}% versus the previous ${analysis.granularity}, from ${formatNumber(kpi.previous ?? 0)} to ${formatNumber(kpi.sparkline[kpi.sparkline.length - 1]?.value ?? 0)}. Investigate the drivers before the next period closes.`,
      evidence: [
        { label: `Latest ${kpi.label}`, value: formatNumber(kpi.sparkline[kpi.sparkline.length - 1]?.value ?? kpi.value) },
        { label: `Previous ${analysis.granularity}`, value: formatNumber(kpi.previous ?? 0) },
        { label: "Change", value: `${kpi.changePct.toFixed(1)}%` },
      ],
      impact: Math.abs(kpi.changePct) >= 20 ? "High" : "Medium",
      confidence: 85,
      status: "open",
    });
  }

  // 3. Anomalies worth investigating.
  const critical = analysis.anomalies.filter((a) =>
    ["high", "critical"].includes(a.severity),
  );
  if (critical.length > 0) {
    const worst = critical[0];
    out.push({
      dataset_id: datasetId,
      job_id: null,
      title: `Investigate the ${worst.direction} on ${worst.occurred_on}`,
      body: `${worst.metric} reached ${formatNumber(worst.actual_value)} on ${worst.occurred_on}, against an expected ${formatNumber(worst.expected_value ?? 0)} based on the surrounding periods. ${critical.length > 1 ? `${critical.length} periods deviate this strongly.` : "This is the strongest deviation in the series."} Confirm whether it reflects a real event or a data problem before acting on it.`,
      evidence: [
        { label: "Date", value: String(worst.occurred_on) },
        { label: "Actual", value: formatNumber(worst.actual_value) },
        { label: "Expected", value: formatNumber(worst.expected_value ?? 0) },
        ...(worst.deviation_pct !== null
          ? [{ label: "Deviation", value: `${worst.deviation_pct.toFixed(1)}%` }]
          : []),
        { label: "Detection confidence", value: `${worst.confidence ?? 0}%` },
      ],
      impact: worst.severity === "critical" ? "High" : "Medium",
      confidence: worst.confidence ?? 70,
      status: "open",
    });
  }

  // 4. Data quality blocking better analysis.
  if (quality && quality.score < 80) {
    const worstIssues = quality.issues.slice(0, 3);
    out.push({
      dataset_id: datasetId,
      job_id: null,
      title: `Data quality is limiting what can be concluded`,
      body: `This dataset scores ${quality.score} out of 100. ${quality.duplicateRows > 0 ? `${quality.duplicateRows.toLocaleString()} duplicate rows would double-count in any total. ` : ""}${quality.missingCells > 0 ? `${quality.missingCells.toLocaleString()} of ${quality.totalCells.toLocaleString()} cells are empty. ` : ""}Fixing these at the source makes every figure above more reliable.`,
      evidence: [
        { label: "Quality score", value: `${quality.score}/100` },
        { label: "Duplicate rows", value: quality.duplicateRows.toLocaleString() },
        { label: "Missing cells", value: `${quality.missingCells.toLocaleString()} of ${quality.totalCells.toLocaleString()}` },
        ...worstIssues.map((issue) => ({
          label: issue.column,
          value: issue.detail,
        })),
      ],
      impact: quality.score < 60 ? "High" : "Medium",
      confidence: 95,
      status: "open",
    });
  }

  // 5. Where the forecast points.
  if (analysis.forecast && analysis.forecast.points.length > 0) {
    const last = analysis.forecast.history[analysis.forecast.history.length - 1];
    const projected = analysis.forecast.points[analysis.forecast.points.length - 1];
    const change = last ? percentChange(projected.value, last.value) : null;
    if (change !== null && Math.abs(change) >= 5) {
      out.push({
        dataset_id: datasetId,
        job_id: null,
        title: `${analysis.forecast.metric} is projected to ${change > 0 ? "rise" : "fall"} by ${Math.abs(change).toFixed(1)}%`,
        body: `Fitting ${analysis.forecast.model} to ${analysis.forecast.history.length} periods projects ${analysis.forecast.metric} at ${formatNumber(projected.value)} by ${projected.period}, against ${formatNumber(last.value)} today. The plausible range is ${formatNumber(projected.lower)} to ${formatNumber(projected.upper)}. Plan against the range, not the single line.`,
        evidence: [
          { label: "Latest actual", value: formatNumber(last.value) },
          { label: `Projected ${projected.period}`, value: formatNumber(projected.value) },
          { label: "Range", value: `${formatNumber(projected.lower)} to ${formatNumber(projected.upper)}` },
          { label: "Model", value: analysis.forecast.model },
          ...(analysis.forecast.mape !== null
            ? [
                {
                  label: accuracyLabel(analysis.forecast.accuracy_basis),
                  value: `${analysis.forecast.mape}%`,
                },
              ]
            : []),
        ],
        impact: Math.abs(change) >= 20 ? "High" : "Medium",
        confidence: analysis.forecast.mape === null ? 60 : Math.max(40, Math.round(100 - analysis.forecast.mape)),
        status: "open",
      });
    }
  }

  return out;
}
