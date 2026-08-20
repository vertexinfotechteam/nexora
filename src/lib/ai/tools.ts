import "server-only";

import { SQL_LIMITS } from "@/lib/env";
import { truncTemporal } from "@/lib/analysis/date-sql";
import {
  DATASET_TABLE,
  QueryError,
  quoteIdent,
  runQuery,
  type QueryResult,
} from "@/lib/duckdb/engine";
import {
  checkTablePermissions,
  enforceRowLimit,
  validateSql,
} from "@/lib/duckdb/sql-guard";
import { detectAnomalies, detectValueOutliers } from "@/lib/analysis/anomaly";
import { accuracyLabel, forecastSeries } from "@/lib/analysis/forecast";
import { selectChart } from "@/lib/analysis/chart";
import { aggregateFor } from "@/lib/analysis/auto";
import { correlation, percentChange } from "@/lib/analysis/stats";
import { formatNumber } from "@/lib/utils";
import type {
  Anomaly,
  ChartSpec,
  DatasetColumn,
  DatasetProfile,
  Forecast,
} from "@/lib/store/types";
import type { AiTool } from "./provider";
import { renderRows, renderSchema, sanitizeUntrusted } from "./prompts";

/**
 * The complete set of capabilities available to the AI.
 *
 * There is deliberately no tool for: raw database access, the filesystem, the
 * shell, arbitrary HTTP, or credentials. The model's entire reach is this file.
 * Every executor below either computes with DuckDB or with the statistics
 * modules — none of them lets the model supply a final number directly.
 */

export type ToolFacts = { label: string; value: string };

export type CollectedOutput = {
  /** Verified figures. Only these may appear in the final narrative. */
  figures: ToolFacts[];
  tables: {
    title: string;
    sql: string;
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
    chart: ChartSpec | null;
  }[];
  anomalies: Omit<Anomaly, "id" | "organization_id" | "created_at">[];
  forecasts: Omit<Forecast, "id" | "organization_id" | "created_at">[];
  /** Set when the model asked for a full report. */
  reportRequested: boolean;
};

export type ToolContext = {
  engineKey: string;
  datasetId: string;
  datasetName: string;
  rowCount: number;
  columns: DatasetColumn[];
  profiles: DatasetProfile[];
  collected: CollectedOutput;
  /** Reports progress to the live activity stream. */
  emit: (event: {
    stage: "schema" | "sql" | "validating" | "executing" | "computing" | "charting";
    label: string;
    detail?: string;
    status: "running" | "ok" | "warn" | "error";
    facts?: ToolFacts[];
    sql?: string;
    durationMs?: number;
  }) => void;
};

export type ToolResult = { display: string; ok: boolean };

export const TOOL_DEFINITIONS: AiTool[] = [
  {
    name: "get_dataset_schema",
    description:
      "Returns the columns of the dataset with their data types, inferred roles, missing-value counts and example values. Call this first when you need to know what the data contains.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_column_statistics",
    description:
      "Returns computed statistics for specific columns: count, missing values, distinct values, min, max, mean, median, standard deviation, quartiles and most frequent values.",
    inputSchema: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Column names to describe. Maximum 12.",
        },
      },
      required: ["columns"],
    },
  },
  {
    name: "execute_readonly_sql",
    description:
      `Runs a read-only DuckDB SELECT query against the "${DATASET_TABLE}" table and returns the rows. This is the main way to compute any figure. The query is validated before execution; DDL, DML and file access are rejected.`,
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: `A single read-only SELECT statement referencing only the "${DATASET_TABLE}" table.`,
        },
        purpose: {
          type: "string",
          description:
            "One short sentence, in plain English, describing what this query works out. Shown live to the user.",
        },
      },
      required: ["sql", "purpose"],
    },
  },
  {
    name: "run_data_analysis",
    description:
      "Computes a period-over-period comparison for a measure, or a correlation matrix between numeric columns. Use this instead of writing the statistics yourself.",
    inputSchema: {
      type: "object",
      properties: {
        analysis: {
          type: "string",
          enum: ["period_comparison", "correlation", "distribution"],
          description: "Which analysis to run.",
        },
        measure: {
          type: "string",
          description: "Numeric column to analyse.",
        },
        date_column: {
          type: "string",
          description:
            "Date column, required for period_comparison. Must be a date or timestamp column.",
        },
        granularity: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year"],
          description: "Period size for period_comparison. Defaults to month.",
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Numeric columns to correlate, for the correlation analysis.",
        },
      },
      required: ["analysis"],
    },
  },
  {
    name: "detect_anomalies",
    description:
      "Runs statistical anomaly detection over a measure across time, or finds extreme individual records when no date column is given. Returns real expected values, deviations and confidence.",
    inputSchema: {
      type: "object",
      properties: {
        measure: { type: "string", description: "Numeric column to check." },
        date_column: {
          type: "string",
          description:
            "Date column to build the time series from. Omit to search for extreme individual records instead.",
        },
        granularity: {
          type: "string",
          enum: ["day", "week", "month", "quarter"],
          description: "Period size. Defaults to day.",
        },
      },
      required: ["measure"],
    },
  },
  {
    name: "forecast_metric",
    description:
      "Fits a statistical forecasting model to a measure over time and projects it forward with a confidence interval. Never state a forecast number that did not come from this tool.",
    inputSchema: {
      type: "object",
      properties: {
        measure: { type: "string", description: "Numeric column to forecast." },
        date_column: { type: "string", description: "Date column for the time axis." },
        periods: {
          type: "number",
          description: "How many periods ahead to project. 1-36.",
        },
        granularity: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year"],
          description: "Period size. Defaults to month.",
        },
      },
      required: ["measure", "date_column", "periods"],
    },
  },
  {
    name: "create_chart",
    description:
      "Renders the most recent query result as a chart. The chart type is chosen from the shape of the data. Call this after a query whose result should be visualised.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Chart title." },
        preferred_type: {
          type: "string",
          enum: ["auto", "line", "bar", "donut", "scatter", "histogram", "heatmap", "table"],
          description:
            "Leave as auto unless the question explicitly asks for a specific chart type.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "generate_report",
    description:
      "Marks the analysis as ready for a full PDF report containing the executive summary, KPIs, charts, insights, anomalies, forecasts and recommendations produced in this session.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Report title." },
      },
      required: ["title"],
    },
  },
];

// ---------------------------------------------------------------------------

function findColumn(ctx: ToolContext, name: unknown): DatasetColumn | null {
  if (typeof name !== "string") return null;
  const target = name.trim().toLowerCase();
  return (
    ctx.columns.find((c) => c.name.toLowerCase() === target) ??
    ctx.columns.find((c) => c.normalized_name === target) ??
    null
  );
}

/**
 * Aggregates a measure the way that measure means something: additive columns
 * are summed, per-unit and rate columns are averaged. Summing "unit_price"
 * would produce a large number with no interpretation.
 */
function measureSql(column: DatasetColumn): string {
  const id = quoteIdent(column.name);
  return aggregateFor(column) === "avg" ? `avg(${id})` : `sum(${id})`;
}

function measureVerb(column: DatasetColumn): string {
  return aggregateFor(column) === "avg" ? "average" : "total";
}

/**
 * Truncates a date column to the period start.
 *
 * The cast to DATE matters: on a TIMESTAMP column date_trunc returns a
 * TIMESTAMP, which serialises as "2024-01-01 00:00:00" and stops the chart
 * selector recognising the column as a time axis — a time series would then be
 * drawn as a bar chart.
 *
 * The try_cast matters for a different reason. A column is treated as a date
 * by its semantic type, which is decided while profiling from what the values
 * look like — but the engine may still be storing it as text, because that is
 * what the file contained. Handing text straight to date_trunc fails the whole
 * step with "No function matches the given name and argument types
 * date_trunc(STRING_LITERAL, VARCHAR)", which is what a forecast on a
 * text-typed month column used to do.
 *
 * try_cast rather than cast: a value that cannot be read as a date becomes
 * NULL and drops out of the series, instead of taking the entire analysis down
 * with it.
 */
function truncSql(column: string, granularity: string): string {
  const unit = ["day", "week", "month", "quarter", "year"].includes(granularity)
    ? granularity
    : "month";
  return `${truncTemporal(quoteIdent(column), unit)}::date`;
}

function seriesFromRows(
  rows: Record<string, unknown>[],
  periodKey: string,
  valueKey: string,
): { period: string; value: number }[] {
  return rows
    .map((row) => ({
      period: String(row[periodKey] ?? "").slice(0, 10),
      value: Number(row[valueKey]),
    }))
    .filter((p) => p.period && Number.isFinite(p.value));
}

/** Records verified figures so the narrative verifier can check against them. */
function addFigures(ctx: ToolContext, facts: ToolFacts[]): void {
  ctx.collected.figures.push(...facts);
}

// ---------------------------------------------------------------------------

async function toolGetSchema(ctx: ToolContext): Promise<ToolResult> {
  ctx.emit({
    stage: "schema",
    label: "Reading the dataset structure",
    detail: `${ctx.columns.length} columns, ${ctx.rowCount.toLocaleString()} rows`,
    status: "ok",
  });

  const profileByName = new Map(ctx.profiles.map((p) => [p.column_name, p]));
  return {
    ok: true,
    display: renderSchema(
      ctx.datasetName,
      ctx.rowCount,
      ctx.columns.map((column) => {
        const profile = profileByName.get(column.name);
        return {
          name: column.name,
          data_type: column.data_type,
          semantic_type: column.semantic_type,
          nullCount: profile?.null_count,
          distinctCount: profile?.distinct_count ?? null,
          sample: profile?.top_values?.map((t) => t.value) ?? [],
        };
      }),
    ),
  };
}

async function toolColumnStatistics(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const requested = Array.isArray(input.columns) ? input.columns.slice(0, 12) : [];
  const resolved = requested
    .map((name) => findColumn(ctx, name))
    .filter((c): c is DatasetColumn => c !== null);

  if (resolved.length === 0) {
    return {
      ok: false,
      display: `None of those columns exist. Available columns: ${ctx.columns.map((c) => c.name).join(", ")}`,
    };
  }

  ctx.emit({
    stage: "computing",
    label: `Summarising ${resolved.length} column${resolved.length === 1 ? "" : "s"}`,
    detail: resolved.map((c) => c.name).join(", "),
    status: "ok",
  });

  const profileByName = new Map(ctx.profiles.map((p) => [p.column_name, p]));
  const lines: string[] = [];
  const facts: ToolFacts[] = [];

  for (const column of resolved) {
    const profile = profileByName.get(column.name);
    if (!profile) continue;
    const parts = [
      `rows with a value: ${(ctx.rowCount - profile.null_count).toLocaleString()}`,
      `missing: ${profile.null_count.toLocaleString()}`,
      `distinct: ${profile.distinct_count?.toLocaleString() ?? "n/a"}`,
    ];
    if (profile.mean_value !== null) {
      parts.push(
        `min: ${profile.min_value}`,
        `max: ${profile.max_value}`,
        `mean: ${formatNumber(profile.mean_value)}`,
        `median: ${formatNumber(profile.median_value)}`,
        `sd: ${formatNumber(profile.stddev_value)}`,
      );
      facts.push({
        label: `${column.name} mean`,
        value: formatNumber(profile.mean_value),
      });
    } else {
      parts.push(`min: ${profile.min_value}`, `max: ${profile.max_value}`);
    }
    if (profile.top_values?.length) {
      parts.push(
        `most common: ${profile.top_values
          .slice(0, 3)
          .map((t) => `${sanitizeUntrusted(t.value, 40)} (${t.count.toLocaleString()})`)
          .join(", ")}`,
      );
    }
    lines.push(`${sanitizeUntrusted(column.name, 80)} — ${parts.join(", ")}`);
  }

  addFigures(ctx, facts);
  return { ok: true, display: lines.join("\n") };
}

async function toolExecuteSql(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const rawSql = typeof input.sql === "string" ? input.sql : "";
  const purpose =
    typeof input.purpose === "string" && input.purpose.trim()
      ? sanitizeUntrusted(input.purpose, 160)
      : "Running a query";

  ctx.emit({
    stage: "sql",
    label: purpose,
    detail: "Query written by the AI planner",
    status: "running",
    sql: rawSql,
  });

  // Stage 1 — static validation.
  const validation = validateSql(rawSql);
  if (!validation.ok) {
    ctx.emit({
      stage: "validating",
      label: "Query rejected by the safety check",
      detail: validation.reason,
      status: "error",
    });
    return {
      ok: false,
      display: `The query was rejected: ${validation.reason} Rewrite it as a read-only SELECT against "${DATASET_TABLE}".`,
    };
  }

  // Stage 2 — permission check using DuckDB's own parser.
  let referenced: string[] = [];
  try {
    const { getTableNamesFor } = await import("@/lib/duckdb/tables");
    referenced = await getTableNamesFor(ctx.engineKey, validation.sql);
  } catch {
    // Parser unavailable for this statement; the sealed engine still confines
    // the query to the loaded table, so continue.
  }
  if (referenced.length > 0) {
    const permission = checkTablePermissions(referenced);
    if (!permission.ok) {
      ctx.emit({
        stage: "validating",
        label: "Query rejected by the permission check",
        detail: permission.reason,
        status: "error",
      });
      return { ok: false, display: `The query was rejected: ${permission.reason}` };
    }
  }

  ctx.emit({
    stage: "validating",
    label: "Safety check passed",
    detail: "Read-only, single statement, dataset table only",
    status: "ok",
  });

  // Stage 3 — execute with a row cap and a hard timeout.
  const limited = enforceRowLimit(validation.sql, SQL_LIMITS.maxRows);
  let result: QueryResult;
  try {
    result = await runQuery(ctx.engineKey, limited);
  } catch (error) {
    const message =
      error instanceof QueryError ? error.message : String(error);
    ctx.emit({
      stage: "executing",
      label: "The query could not be run",
      detail: message,
      status: "error",
    });
    return {
      ok: false,
      display: `The query failed: ${message} Check the column names against the schema and try again.`,
    };
  }

  ctx.emit({
    stage: "executing",
    label: `Computed ${result.rowCount.toLocaleString()} ${result.rowCount === 1 ? "row" : "rows"}`,
    detail: `${result.columns.length} columns in ${result.durationMs}ms${result.truncated ? ` (capped at ${SQL_LIMITS.maxRows.toLocaleString()} rows)` : ""}`,
    status: result.truncated ? "warn" : "ok",
    durationMs: result.durationMs,
    sql: validation.sql,
  });

  // Single-value results become verified figures immediately.
  const facts: ToolFacts[] = [];
  if (result.rowCount === 1) {
    for (const column of result.columns) {
      const value = result.rows[0][column.name];
      if (typeof value === "number" && Number.isFinite(value)) {
        facts.push({ label: column.name, value: formatNumber(value) });
      }
    }
  }
  addFigures(ctx, facts);

  ctx.collected.tables.push({
    title: purpose,
    sql: validation.sql,
    columns: result.columns,
    rows: result.rows,
    chart: null,
  });

  return {
    ok: true,
    display: renderRows(result.columns, result.rows),
  };
}

async function toolRunAnalysis(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const analysis = String(input.analysis ?? "");

  if (analysis === "period_comparison") {
    const measure = findColumn(ctx, input.measure);
    const dateColumn = findColumn(ctx, input.date_column);
    if (!measure || !dateColumn) {
      return {
        ok: false,
        display: "period_comparison needs a valid numeric 'measure' and a date 'date_column'.",
      };
    }
    const granularity = String(input.granularity ?? "month");

    ctx.emit({
      stage: "computing",
      label: `Comparing ${measure.name} period over period`,
      detail: `grouped by ${granularity}`,
      status: "running",
    });

    const result = await runQuery(
      ctx.engineKey,
      `select ${truncSql(dateColumn.name, granularity)} as period,
              ${measureSql(measure)}::double as total
       from ${DATASET_TABLE}
       where ${quoteIdent(dateColumn.name)} is not null
       group by 1 order by 1`,
    );

    const series = seriesFromRows(result.rows, "period", "total");
    if (series.length < 2) {
      return {
        ok: false,
        display: `Only ${series.length} period(s) of data are available, so no period-over-period comparison is possible.`,
      };
    }

    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    const change = percentChange(current.value, previous.value);

    const verb = measureVerb(measure);
    const facts: ToolFacts[] = [
      {
        label: `${verb} ${measure.name} in ${current.period}`,
        value: formatNumber(current.value),
      },
      {
        label: `${verb} ${measure.name} in ${previous.period}`,
        value: formatNumber(previous.value),
      },
    ];
    if (change !== null) {
      facts.push({
        label: "Change vs previous period",
        value: `${change.toFixed(1)}%`,
      });
    }
    addFigures(ctx, facts);

    ctx.collected.tables.push({
      title: `${measure.name} by ${granularity}`,
      sql: "",
      columns: result.columns,
      rows: result.rows,
      chart: selectChart({ columns: result.columns, rows: result.rows, question: `${measure.name} by ${granularity}` }),
    });

    ctx.emit({
      stage: "computing",
      label: `${measure.name} changed ${change === null ? "—" : `${change.toFixed(1)}%`} versus the previous ${granularity}`,
      detail: `${formatNumber(previous.value)} â†’ ${formatNumber(current.value)}`,
      status: "ok",
      facts,
    });

    return {
      ok: true,
      display: `Latest period ${current.period}: ${formatNumber(current.value)}. Previous period ${previous.period}: ${formatNumber(previous.value)}. Change: ${change === null ? "not computable" : `${change.toFixed(1)}%`}. Full series has ${series.length} periods.`,
    };
  }

  if (analysis === "correlation") {
    const requested = Array.isArray(input.columns) ? input.columns : [];
    const resolved = requested
      .map((name) => findColumn(ctx, name))
      .filter((c): c is DatasetColumn => c !== null && c.semantic_type === "measure")
      .slice(0, 6);

    if (resolved.length < 2) {
      return {
        ok: false,
        display: "Correlation needs at least two numeric columns.",
      };
    }

    ctx.emit({
      stage: "computing",
      label: `Correlating ${resolved.length} numeric columns`,
      status: "running",
    });

    const result = await runQuery(
      ctx.engineKey,
      `select ${resolved.map((c) => `${quoteIdent(c.name)}::double as ${quoteIdent(c.normalized_name)}`).join(", ")}
       from ${DATASET_TABLE}`,
      { maxRows: 50_000 },
    );

    const lines: string[] = [];
    const facts: ToolFacts[] = [];
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = result.rows.map((r) => Number(r[resolved[i].normalized_name]));
        const b = result.rows.map((r) => Number(r[resolved[j].normalized_name]));
        const r = correlation(
          a.filter(Number.isFinite),
          b.filter(Number.isFinite),
        );
        if (r === null) continue;
        lines.push(`${resolved[i].name} vs ${resolved[j].name}: r = ${r.toFixed(3)}`);
        facts.push({
          label: `Correlation ${resolved[i].name} / ${resolved[j].name}`,
          value: r.toFixed(3),
        });
      }
    }
    addFigures(ctx, facts);

    ctx.emit({
      stage: "computing",
      label: `Computed ${lines.length} correlation pair${lines.length === 1 ? "" : "s"}`,
      status: "ok",
      facts,
    });

    return {
      ok: true,
      display: lines.length ? lines.join("\n") : "No pair had enough variation to correlate.",
    };
  }

  if (analysis === "distribution") {
    const measure = findColumn(ctx, input.measure);
    if (!measure) return { ok: false, display: "distribution needs a numeric 'measure'." };

    const profile = ctx.profiles.find((p) => p.column_name === measure.name);
    if (!profile) return { ok: false, display: "No profile is available for that column." };

    const facts: ToolFacts[] = [
      { label: `${measure.name} median`, value: formatNumber(profile.median_value) },
      { label: `${measure.name} p25`, value: formatNumber(profile.p25_value) },
      { label: `${measure.name} p75`, value: formatNumber(profile.p75_value) },
    ];
    addFigures(ctx, facts);

    ctx.emit({
      stage: "computing",
      label: `Described the distribution of ${measure.name}`,
      status: "ok",
      facts,
    });

    return {
      ok: true,
      display: `${measure.name}: min ${profile.min_value}, p25 ${formatNumber(profile.p25_value)}, median ${formatNumber(profile.median_value)}, p75 ${formatNumber(profile.p75_value)}, max ${profile.max_value}, sd ${formatNumber(profile.stddev_value)}, outliers ${profile.outlier_count ?? 0}.`,
    };
  }

  return { ok: false, display: `Unknown analysis "${analysis}".` };
}

async function toolDetectAnomalies(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const measure = findColumn(ctx, input.measure);
  if (!measure) {
    return { ok: false, display: "detect_anomalies needs a valid numeric 'measure'." };
  }
  const dateColumn = findColumn(ctx, input.date_column);
  const granularity = String(input.granularity ?? "day");

  ctx.emit({
    stage: "computing",
    label: `Looking for unusual ${measure.name} values`,
    detail: dateColumn
      ? `time series by ${granularity}, robust z-score`
      : "extreme individual records, robust z-score",
    status: "running",
  });

  if (!dateColumn) {
    const result = await runQuery(
      ctx.engineKey,
      `select * from ${DATASET_TABLE} where ${quoteIdent(measure.name)} is not null`,
      { maxRows: 50_000 },
    );
    const { outliers, centre, scale } = detectValueOutliers(result.rows, measure.name);

    const facts: ToolFacts[] = [
      { label: `${measure.name} typical value`, value: formatNumber(centre) },
      { label: "Unusual records found", value: String(outliers.length) },
    ];
    addFigures(ctx, facts);

    ctx.emit({
      stage: "computing",
      label: `Found ${outliers.length} unusual record${outliers.length === 1 ? "" : "s"}`,
      detail: `typical ${measure.name} is ${formatNumber(centre)}`,
      status: outliers.length > 0 ? "warn" : "ok",
      facts,
    });

    if (outliers.length === 0) {
      return {
        ok: true,
        display: `No records deviated more than 3.5 robust standard deviations from the median of ${formatNumber(centre)} (scale ${formatNumber(scale)}).`,
      };
    }

    ctx.collected.tables.push({
      title: `Unusual ${measure.name} records`,
      sql: "",
      columns: result.columns,
      rows: outliers.map((o) => o.row),
      chart: null,
    });

    return {
      ok: true,
      display: outliers
        .slice(0, 15)
        .map((o) => `value ${formatNumber(o.value)} (z=${o.zScore})`)
        .join("\n"),
    };
  }

  const result = await runQuery(
    ctx.engineKey,
    `select ${truncSql(dateColumn.name, granularity)} as period,
            ${measureSql(measure)}::double as total
     from ${DATASET_TABLE}
     where ${quoteIdent(dateColumn.name)} is not null
     group by 1 order by 1`,
  );

  const series = seriesFromRows(result.rows, "period", "total");
  const { anomalies, note } = detectAnomalies(series);

  for (const anomaly of anomalies) {
    ctx.collected.anomalies.push({
      dataset_id: ctx.datasetId,
      job_id: null,
      metric: measure.name,
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
    });
  }

  const facts: ToolFacts[] = anomalies.slice(0, 5).flatMap((anomaly) => [
    { label: `${anomaly.period} actual`, value: formatNumber(anomaly.actual) },
    { label: `${anomaly.period} expected`, value: formatNumber(anomaly.expected) },
    ...(anomaly.deviationPct !== null
      ? [{ label: `${anomaly.period} deviation`, value: `${anomaly.deviationPct.toFixed(1)}%` }]
      : []),
    { label: `${anomaly.period} confidence`, value: `${anomaly.confidence}%` },
  ]);
  addFigures(ctx, facts);

  ctx.emit({
    stage: "computing",
    label:
      anomalies.length > 0
        ? `Found ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} across ${series.length} periods`
        : `No anomalies across ${series.length} periods`,
    detail: note ?? anomalies[0]?.method,
    status: anomalies.length > 0 ? "warn" : "ok",
    facts,
  });

  ctx.collected.tables.push({
    title: `${measure.name} by ${granularity}`,
    sql: "",
    columns: result.columns,
    rows: result.rows,
    chart: selectChart({
      columns: result.columns,
      rows: result.rows,
      question: `${measure.name} by ${granularity}`,
    }),
  });

  if (anomalies.length === 0) {
    return { ok: true, display: note ?? "No anomalies were detected." };
  }

  return {
    ok: true,
    display: anomalies
      .map(
        (a) =>
          `${a.period}: actual ${formatNumber(a.actual)}, expected ${formatNumber(a.expected)}, deviation ${a.deviationPct?.toFixed(1) ?? "n/a"}%, ${a.direction}, severity ${a.severity}, confidence ${a.confidence}%`,
      )
      .join("\n"),
  };
}

async function toolForecast(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const measure = findColumn(ctx, input.measure);
  const dateColumn = findColumn(ctx, input.date_column);
  if (!measure || !dateColumn) {
    return {
      ok: false,
      display: "forecast_metric needs a valid numeric 'measure' and a date 'date_column'.",
    };
  }

  const periods = Math.max(1, Math.min(36, Number(input.periods) || 3));
  const granularity = String(input.granularity ?? "month") as
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";

  ctx.emit({
    stage: "computing",
    label: `Forecasting ${measure.name} for the next ${periods} ${granularity}${periods === 1 ? "" : "s"}`,
    detail: "fitting statistical models and backtesting",
    status: "running",
  });

  const result = await runQuery(
    ctx.engineKey,
    `select ${truncSql(dateColumn.name, granularity)} as period,
            ${measureSql(measure)}::double as total
     from ${DATASET_TABLE}
     where ${quoteIdent(dateColumn.name)} is not null
     group by 1 order by 1`,
  );

  const history = seriesFromRows(result.rows, "period", "total");
  const forecast = forecastSeries(history, periods, granularity);

  if (forecast.points.length === 0) {
    ctx.emit({
      stage: "computing",
      label: "Not enough history to forecast",
      detail: forecast.qualityNote ?? undefined,
      status: "warn",
    });
    return { ok: false, display: forecast.qualityNote ?? "Not enough history to forecast." };
  }

  ctx.collected.forecasts.push({
    dataset_id: ctx.datasetId,
    job_id: null,
    metric: measure.name,
    horizon: periods,
    granularity,
    model: forecast.model,
    mape: forecast.mape,
    accuracy_basis: forecast.accuracyBasis,
    history,
    points: forecast.points,
    data_quality_note: forecast.qualityNote,
  });

  const facts: ToolFacts[] = forecast.points.slice(0, 6).map((point) => ({
    label: `${measure.name} forecast ${point.period}`,
    value: formatNumber(point.value),
  }));
  if (forecast.mape !== null) {
    facts.push({
      label: accuracyLabel(forecast.accuracyBasis),
      value: `${forecast.mape}%`,
    });
  }
  addFigures(ctx, facts);

  ctx.emit({
    stage: "computing",
    label: `Projected ${periods} ${granularity}${periods === 1 ? "" : "s"} ahead`,
    detail: `${forecast.model}${forecast.mape !== null ? `, ${accuracyLabel(forecast.accuracyBasis).toLowerCase()} ${forecast.mape}%` : ""}`,
    status: "ok",
    facts,
  });

  return {
    ok: true,
    display: `Model: ${forecast.model}. ${accuracyLabel(forecast.accuracyBasis)}: ${forecast.mape ?? "n/a"}%. History: ${history.length} periods.
${forecast.points.map((p) => `${p.period}: ${formatNumber(p.value)} (range ${formatNumber(p.lower)} to ${formatNumber(p.upper)})`).join("\n")}
${forecast.qualityNote ? `Data quality note: ${forecast.qualityNote}` : ""}`,
  };
}

async function toolCreateChart(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const table = ctx.collected.tables[ctx.collected.tables.length - 1];
  if (!table) {
    return {
      ok: false,
      display: "There is no query result to chart yet. Run a query first.",
    };
  }

  const title =
    typeof input.title === "string" ? sanitizeUntrusted(input.title, 120) : "Result";
  const preferred = String(input.preferred_type ?? "auto");

  const spec = selectChart({
    columns: table.columns,
    rows: table.rows,
    question: title,
  });

  // The model may nudge the type, but only to something the data supports.
  const finalSpec: ChartSpec =
    preferred !== "auto" && preferred !== spec.type && spec.yKeys.length > 0
      ? {
          ...spec,
          type: preferred as ChartSpec["type"],
          reason: `${spec.reason} Overridden to ${preferred} because the question asked for it.`,
        }
      : spec;

  table.chart = finalSpec;

  ctx.emit({
    stage: "charting",
    label: `Chose a ${finalSpec.type} chart`,
    detail: finalSpec.reason,
    status: "ok",
  });

  return {
    ok: true,
    display: `Chart created: ${finalSpec.type}, x = ${finalSpec.xKey}, y = ${finalSpec.yKeys.join(", ")}. Reason: ${finalSpec.reason}`,
  };
}

async function toolGenerateReport(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  ctx.collected.reportRequested = true;
  const title =
    typeof input.title === "string" ? sanitizeUntrusted(input.title, 140) : "Analysis report";

  ctx.emit({
    stage: "computing",
    label: "Preparing the PDF report",
    detail: title,
    status: "ok",
  });

  return {
    ok: true,
    display:
      "The report will be assembled from the verified results of this analysis and offered to the user as a PDF download.",
  };
}

// ---------------------------------------------------------------------------

const EXECUTORS: Record<
  string,
  (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolResult>
> = {
  get_dataset_schema: (ctx) => toolGetSchema(ctx),
  get_column_statistics: toolColumnStatistics,
  execute_readonly_sql: toolExecuteSql,
  run_data_analysis: toolRunAnalysis,
  detect_anomalies: toolDetectAnomalies,
  forecast_metric: toolForecast,
  create_chart: toolCreateChart,
  generate_report: toolGenerateReport,
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const executor = EXECUTORS[name];
  if (!executor) {
    return {
      ok: false,
      display: `There is no tool called "${name}". Available tools: ${Object.keys(EXECUTORS).join(", ")}.`,
    };
  }
  try {
    return await executor(ctx, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.emit({
      stage: "computing",
      label: `The ${name.replace(/_/g, " ")} step failed`,
      detail: message,
      status: "error",
    });
    return { ok: false, display: `The tool failed: ${message}` };
  }
}
