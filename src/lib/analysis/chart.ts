import type { ChartSpec, DatasetColumn, SemanticType } from "@/lib/store/types";

/**
 * Chart selection.
 *
 * The spec's mapping (time series -> line, category -> bar, distribution ->
 * histogram, correlation -> scatter, composition -> donut, multiple metrics ->
 * heatmap) is applied to the *shape of the returned result set*, not to the
 * user's wording. That means the chart always matches the data actually
 * computed, and the AI cannot pick a chart the numbers do not support.
 */

export type ResultColumn = { name: string; type: string };

const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|REAL|NUMERIC)/i;
const TEMPORAL = /^(DATE|TIMESTAMP|TIME)/i;

function looksTemporal(column: ResultColumn, sample: unknown[]): boolean {
  if (TEMPORAL.test(column.type)) return true;
  // Aggregations return period labels as strings in several shapes:
  //   2025 · 2025-03 · 2025-03-14 · 2025-03-14 00:00:00 · 2025-03-14T00:00:00Z · 2025 Q1
  // Missing the datetime form makes a time series render as a bar chart.
  const values = sample.filter((v) => v !== null && v !== undefined).slice(0, 20);
  if (values.length === 0) return false;
  const pattern =
    /^\d{4}(-\d{2}(-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?)?)?$|^\d{4}[\s-]?Q[1-4]$/i;
  return values.every((v) => pattern.test(String(v).trim()));
}

const CURRENCY_HINT = /(revenue|sales|amount|price|cost|value|profit|spend|gmv|aov|income|total)/i;
const PERCENT_HINT = /(rate|percent|pct|ratio|share|margin|churn|conversion)/i;

function valueFormatFor(name: string): ChartSpec["valueFormat"] {
  if (PERCENT_HINT.test(name)) return "percent";
  if (CURRENCY_HINT.test(name)) return "currency";
  return "number";
}

export type ChartInput = {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  /** The user's question, used only for the title — never for chart choice. */
  question?: string;
  /** Dataset-level semantic types, when the result maps to source columns. */
  semanticTypes?: Map<string, SemanticType>;
};

export function selectChart(input: ChartInput): ChartSpec {
  const { columns, rows } = input;
  const title = input.question?.trim().replace(/\?+$/, "") || "Result";

  if (columns.length === 0 || rows.length === 0) {
    return {
      type: "table",
      title,
      xKey: "",
      yKeys: [],
      reason: "The query returned no rows, so there is nothing to plot.",
    };
  }

  const sampleFor = (name: string) => rows.slice(0, 20).map((r) => r[name]);

  const numericColumns = columns.filter((c) => NUMERIC.test(c.type));
  const temporalColumns = columns.filter((c) => looksTemporal(c, sampleFor(c.name)));
  const categoricalColumns = columns.filter(
    (c) => !NUMERIC.test(c.type) && !temporalColumns.includes(c),
  );

  // A single scalar is a KPI, not a chart.
  if (rows.length === 1 && numericColumns.length === 1 && columns.length === 1) {
    return {
      type: "table",
      title,
      xKey: "",
      yKeys: [numericColumns[0].name],
      valueFormat: valueFormatFor(numericColumns[0].name),
      reason: "A single value is shown as a figure rather than a chart.",
    };
  }

  // 1. Time series -> line
  if (temporalColumns.length >= 1 && numericColumns.length >= 1) {
    const xKey = temporalColumns[0].name;
    const yKeys = numericColumns.map((c) => c.name).slice(0, 4);
    const series = categoricalColumns.find((c) => c.name !== xKey);
    return {
      type: "line",
      title,
      xKey,
      yKeys,
      seriesKey: series && yKeys.length === 1 ? series.name : undefined,
      xLabel: xKey,
      yLabel: yKeys[0],
      valueFormat: valueFormatFor(yKeys[0]),
      reason: `"${xKey}" is a time dimension, so the values are drawn as a line over time.`,
    };
  }

  // 2. Correlation -> scatter (two measures, no grouping dimension)
  if (numericColumns.length >= 2 && categoricalColumns.length === 0 && rows.length > 10) {
    return {
      type: "scatter",
      title,
      xKey: numericColumns[0].name,
      yKeys: [numericColumns[1].name],
      xLabel: numericColumns[0].name,
      yLabel: numericColumns[1].name,
      valueFormat: valueFormatFor(numericColumns[1].name),
      reason: "Two numeric columns with no grouping are plotted against each other to show their relationship.",
    };
  }

  // 3. Distribution -> histogram (one measure, many rows, no dimension)
  if (numericColumns.length === 1 && categoricalColumns.length === 0 && rows.length > 20) {
    return {
      type: "histogram",
      title,
      xKey: numericColumns[0].name,
      yKeys: [numericColumns[0].name],
      xLabel: numericColumns[0].name,
      yLabel: "Frequency",
      reason: "A single numeric column across many rows is shown as a distribution.",
    };
  }

  // 4. Multiple metrics across a dimension -> heatmap
  if (categoricalColumns.length >= 2 && numericColumns.length === 1 && rows.length > 12) {
    return {
      type: "heatmap",
      title,
      xKey: categoricalColumns[0].name,
      seriesKey: categoricalColumns[1].name,
      yKeys: [numericColumns[0].name],
      valueFormat: valueFormatFor(numericColumns[0].name),
      reason: "Two dimensions with one measure are shown as a heatmap so both breakdowns stay visible.",
    };
  }

  // 5. Composition -> donut (few categories, parts of a whole)
  if (
    categoricalColumns.length === 1 &&
    numericColumns.length === 1 &&
    rows.length <= 8 &&
    rows.every((r) => Number(r[numericColumns[0].name]) >= 0)
  ) {
    return {
      type: "donut",
      title,
      xKey: categoricalColumns[0].name,
      yKeys: [numericColumns[0].name],
      valueFormat: valueFormatFor(numericColumns[0].name),
      reason: `${rows.length} non-negative categories make up a whole, so the split is shown as a donut.`,
    };
  }

  // 6. Category comparison -> bar
  if (categoricalColumns.length >= 1 && numericColumns.length >= 1) {
    return {
      type: "bar",
      title,
      xKey: categoricalColumns[0].name,
      yKeys: numericColumns.map((c) => c.name).slice(0, 3),
      xLabel: categoricalColumns[0].name,
      yLabel: numericColumns[0].name,
      valueFormat: valueFormatFor(numericColumns[0].name),
      reason: `Values are compared across "${categoricalColumns[0].name}", so a bar chart ranks them directly.`,
    };
  }

  return {
    type: "table",
    title,
    xKey: columns[0].name,
    yKeys: [],
    reason: "The result has no numeric column to plot, so it is shown as a table.",
  };
}

export function semanticTypeMap(columns: DatasetColumn[]): Map<string, SemanticType> {
  return new Map(columns.map((c) => [c.name, c.semantic_type]));
}
