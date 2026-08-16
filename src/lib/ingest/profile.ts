import "server-only";

import { DATASET_TABLE, quoteIdent, runQuery } from "@/lib/duckdb/engine";
import { slugify } from "@/lib/utils";
import type {
  ColumnIssue,
  DatasetColumn,
  DatasetProfile,
  DatasetQuality,
  SemanticType,
} from "@/lib/store/types";

/**
 * Data profiling. Every number produced here comes from a DuckDB aggregate over
 * the full dataset — nothing is sampled, estimated, or produced by a model.
 */

type RawColumn = { name: string; type: string };

const NUMERIC_TYPES =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|REAL|NUMERIC)/i;
const TEMPORAL_TYPES = /^(DATE|TIMESTAMP|TIME|INTERVAL)/i;
const BOOLEAN_TYPES = /^BOOLEAN/i;

export function isNumeric(type: string): boolean {
  return NUMERIC_TYPES.test(type);
}
export function isTemporal(type: string): boolean {
  return TEMPORAL_TYPES.test(type);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, 200);
}

/** Column names that conventionally identify a row rather than measure it. */
const ID_NAME = /(^|_)(id|uuid|guid|key|code|sku|ref|reference|number|no)$/i;

function inferSemanticType(
  column: RawColumn,
  stats: { distinct: number | null; rowCount: number },
): SemanticType {
  if (BOOLEAN_TYPES.test(column.type)) return "boolean";
  if (isTemporal(column.type)) return "date";

  const distinct = stats.distinct ?? 0;
  const rows = stats.rowCount || 1;

  if (isNumeric(column.type)) {
    // A numeric column that is almost entirely unique and named like a key is
    // an identifier, not something worth summing.
    if (ID_NAME.test(column.name) && distinct / rows > 0.9) return "identifier";
    return "measure";
  }

  if (ID_NAME.test(column.name) && distinct / rows > 0.9) return "identifier";
  // Low cardinality strings group well; high cardinality strings are free text.
  if (distinct > 0 && distinct <= Math.max(50, rows * 0.05)) return "dimension";
  return "text";
}

export type ProfileOutput = {
  columns: Omit<DatasetColumn, "id" | "organization_id" | "dataset_id">[];
  profiles: Omit<DatasetProfile, "id" | "organization_id" | "dataset_id">[];
  quality: DatasetQuality;
};

/**
 * Rebuilds the quality summary from stored per-column profiles.
 *
 * Profiling runs once at upload; later analyses read the saved profiles rather
 * than re-scanning the file. Without this the report would omit the data
 * quality section on every run after the first, which reads as "no issues"
 * when the truth is "not recomputed".
 *
 * The duplicate-row count cannot be derived from per-column profiles, so it is
 * passed in by the caller from the freshly loaded engine.
 */
export function qualityFromProfiles(
  profiles: DatasetProfile[],
  rowCount: number,
  duplicateRows: number,
): DatasetQuality {
  const columnCount = profiles.length;
  const totalCells = rowCount * columnCount;

  let missingCells = 0;
  let emptyColumns = 0;
  let constantColumns = 0;
  let outlierTotal = 0;
  let numericColumns = 0;
  const issues: (ColumnIssue & { column: string })[] = [];

  for (const profile of profiles) {
    missingCells += profile.null_count;
    if (rowCount > 0 && profile.null_count >= rowCount) emptyColumns++;
    if (rowCount > 1 && profile.distinct_count === 1) constantColumns++;
    if (profile.outlier_count !== null) {
      outlierTotal += profile.outlier_count;
      numericColumns++;
    }
    for (const issue of profile.issues) {
      issues.push({ ...issue, column: profile.column_name });
    }
  }

  const completeness = totalCells > 0 ? 1 - missingCells / totalCells : 1;
  const uniqueness = rowCount > 0 ? 1 - duplicateRows / rowCount : 1;
  const structure =
    columnCount > 0 ? 1 - (emptyColumns + constantColumns) / columnCount : 1;
  const outlierRate =
    numericColumns > 0 && rowCount > 0
      ? outlierTotal / (rowCount * numericColumns)
      : 0;
  const validity = 1 - Math.min(1, outlierRate * 2);

  const score =
    (completeness * 0.4 + uniqueness * 0.25 + structure * 0.2 + validity * 0.15) *
    100;

  const rank = { high: 0, medium: 1, low: 2 } as const;

  return {
    score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10,
    rowCount,
    columnCount,
    duplicateRows,
    missingCells,
    totalCells,
    emptyColumns,
    constantColumns,
    issues: issues.sort(
      (a, b) => rank[a.severity] - rank[b.severity] || b.affected - a.affected,
    ),
  };
}

/** Counts exact duplicate rows in the loaded table. */
export async function countDuplicateRows(engineKey: string): Promise<number> {
  const result = await runQuery(
    engineKey,
    `select (select count(*) from ${DATASET_TABLE})
            - (select count(*) from (select distinct * from ${DATASET_TABLE})) as dupes`,
  );
  return Math.max(0, Number(result.rows[0]?.dupes ?? 0));
}

export async function profileDataset(
  engineKey: string,
  onProgress?: (message: string) => void,
): Promise<ProfileOutput> {
  // --- schema -------------------------------------------------------------
  const schema = await runQuery(
    engineKey,
    `select * from ${DATASET_TABLE} limit 0`,
  );
  const rawColumns: RawColumn[] = schema.columns.map((c) => ({
    name: c.name,
    type: c.type,
  }));

  if (rawColumns.length === 0) {
    throw new Error("The dataset has no columns.");
  }

  // --- row count and duplicates ------------------------------------------
  onProgress?.("Counting rows and duplicates");
  const counts = await runQuery(
    engineKey,
    `select
       (select count(*) from ${DATASET_TABLE})                       as total_rows,
       (select count(*) from (select distinct * from ${DATASET_TABLE})) as distinct_rows`,
  );
  const rowCount = num(counts.rows[0]?.total_rows) ?? 0;
  const distinctRows = num(counts.rows[0]?.distinct_rows) ?? rowCount;
  const duplicateRows = Math.max(0, rowCount - distinctRows);

  // --- per-column aggregates ---------------------------------------------
  onProgress?.(`Profiling ${rawColumns.length} columns`);
  const stats = new Map<string, Record<string, unknown>>();

  for (const group of chunk(rawColumns, 8)) {
    const selects = group.flatMap((column) => {
      const id = quoteIdent(column.name);
      const alias = slugify(column.name) || `c${group.indexOf(column)}`;
      const base = [
        `count(${id}) as ${quoteIdent(`${alias}__nonnull`)}`,
        `approx_count_distinct(${id}) as ${quoteIdent(`${alias}__distinct`)}`,
      ];
      if (isNumeric(column.type)) {
        return [
          ...base,
          `min(${id})::double as ${quoteIdent(`${alias}__min`)}`,
          `max(${id})::double as ${quoteIdent(`${alias}__max`)}`,
          `avg(${id})::double as ${quoteIdent(`${alias}__mean`)}`,
          `median(${id})::double as ${quoteIdent(`${alias}__median`)}`,
          `stddev_samp(${id})::double as ${quoteIdent(`${alias}__stddev`)}`,
          `quantile_cont(${id}, 0.25)::double as ${quoteIdent(`${alias}__p25`)}`,
          `quantile_cont(${id}, 0.75)::double as ${quoteIdent(`${alias}__p75`)}`,
        ];
      }
      return [
        ...base,
        `min(${id})::varchar as ${quoteIdent(`${alias}__min`)}`,
        `max(${id})::varchar as ${quoteIdent(`${alias}__max`)}`,
      ];
    });

    const result = await runQuery(
      engineKey,
      `select ${selects.join(", ")} from ${DATASET_TABLE}`,
    );
    const row = result.rows[0] ?? {};
    for (const column of group) {
      const alias = slugify(column.name) || `c${group.indexOf(column)}`;
      stats.set(column.name, {
        nonNull: row[`${alias}__nonnull`],
        distinct: row[`${alias}__distinct`],
        min: row[`${alias}__min`],
        max: row[`${alias}__max`],
        mean: row[`${alias}__mean`],
        median: row[`${alias}__median`],
        stddev: row[`${alias}__stddev`],
        p25: row[`${alias}__p25`],
        p75: row[`${alias}__p75`],
      });
    }
  }

  // --- outliers (Tukey fences, computed from the real quartiles) ----------
  const numericColumns = rawColumns.filter((c) => isNumeric(c.type));
  const outliers = new Map<string, number>();

  for (const group of chunk(numericColumns, 8)) {
    const selects: string[] = [];
    for (const column of group) {
      const s = stats.get(column.name)!;
      const p25 = num(s.p25);
      const p75 = num(s.p75);
      if (p25 === null || p75 === null) continue;
      const iqr = p75 - p25;
      if (!Number.isFinite(iqr) || iqr === 0) continue;
      const low = p25 - 1.5 * iqr;
      const high = p75 + 1.5 * iqr;
      const alias = slugify(column.name);
      selects.push(
        `count(*) filter (where ${quoteIdent(column.name)} < ${low} or ${quoteIdent(column.name)} > ${high}) as ${quoteIdent(`${alias}__out`)}`,
      );
    }
    if (selects.length === 0) continue;
    const result = await runQuery(
      engineKey,
      `select ${selects.join(", ")} from ${DATASET_TABLE}`,
    );
    const row = result.rows[0] ?? {};
    for (const column of group) {
      const value = num(row[`${slugify(column.name)}__out`]);
      if (value !== null) outliers.set(column.name, value);
    }
  }

  // --- top values for low-cardinality columns -----------------------------
  const topValues = new Map<string, { value: string; count: number }[]>();
  for (const column of rawColumns) {
    const distinct = num(stats.get(column.name)?.distinct) ?? 0;
    if (distinct === 0 || distinct > 50 || isNumeric(column.type)) continue;
    const result = await runQuery(
      engineKey,
      `select ${quoteIdent(column.name)}::varchar as value, count(*) as n
       from ${DATASET_TABLE}
       where ${quoteIdent(column.name)} is not null
       group by 1 order by n desc limit 8`,
      { maxRows: 8 },
    );
    topValues.set(
      column.name,
      result.rows.map((r) => ({
        value: String(r.value ?? ""),
        count: num(r.n) ?? 0,
      })),
    );
  }

  // --- assemble -----------------------------------------------------------
  const columns: ProfileOutput["columns"] = [];
  const profiles: ProfileOutput["profiles"] = [];
  const allIssues: (ColumnIssue & { column: string })[] = [];
  let missingCells = 0;
  let emptyColumns = 0;
  let constantColumns = 0;

  rawColumns.forEach((column, index) => {
    const s = stats.get(column.name) ?? {};
    const nonNull = num(s.nonNull) ?? 0;
    const nullCount = Math.max(0, rowCount - nonNull);
    const distinct = num(s.distinct);
    missingCells += nullCount;

    const semanticType = inferSemanticType(column, { distinct, rowCount });

    columns.push({
      position: index,
      name: column.name,
      normalized_name: slugify(column.name),
      data_type: column.type,
      semantic_type: semanticType,
      nullable: nullCount > 0,
    });

    const issues: ColumnIssue[] = [];

    if (rowCount > 0 && nonNull === 0) {
      emptyColumns++;
      issues.push({
        code: "empty_column",
        severity: "high",
        detail: "Every value in this column is missing.",
        affected: rowCount,
      });
    } else if (nullCount > 0) {
      const pct = (nullCount / rowCount) * 100;
      issues.push({
        code: "missing_values",
        severity: pct > 40 ? "high" : pct > 10 ? "medium" : "low",
        detail: `${nullCount.toLocaleString()} of ${rowCount.toLocaleString()} values are missing (${pct.toFixed(1)}%).`,
        affected: nullCount,
      });
    }

    if (rowCount > 1 && distinct === 1) {
      constantColumns++;
      issues.push({
        code: "constant_column",
        severity: "medium",
        detail: "Every row holds the same value, so this column cannot explain any variation.",
        affected: rowCount,
      });
    }

    const outlierCount = outliers.get(column.name) ?? null;
    if (outlierCount && outlierCount > 0) {
      issues.push({
        code: "outliers",
        severity: outlierCount / Math.max(rowCount, 1) > 0.05 ? "medium" : "low",
        detail: `${outlierCount.toLocaleString()} values fall outside 1.5× the interquartile range.`,
        affected: outlierCount,
      });
    }

    if (
      semanticType === "text" &&
      distinct !== null &&
      rowCount > 100 &&
      distinct / rowCount > 0.95
    ) {
      issues.push({
        code: "high_cardinality",
        severity: "low",
        detail: "Nearly every row has a different value, so this column will not group usefully.",
        affected: distinct,
      });
    }

    for (const issue of issues) allIssues.push({ ...issue, column: column.name });

    profiles.push({
      column_name: column.name,
      null_count: nullCount,
      distinct_count: distinct,
      min_value: text(s.min),
      max_value: text(s.max),
      mean_value: num(s.mean),
      median_value: num(s.median),
      stddev_value: num(s.stddev),
      p25_value: num(s.p25),
      p75_value: num(s.p75),
      outlier_count: outlierCount,
      top_values: topValues.get(column.name) ?? null,
      issues,
    });
  });

  const totalCells = rowCount * rawColumns.length;

  // Quality score: four measured dimensions, weighted. No model involvement.
  const completeness = totalCells > 0 ? 1 - missingCells / totalCells : 1;
  const uniqueness = rowCount > 0 ? 1 - duplicateRows / rowCount : 1;
  const structure =
    rawColumns.length > 0
      ? 1 - (emptyColumns + constantColumns) / rawColumns.length
      : 1;
  // Averaged over the columns an outlier count was actually computed for — a
  // numeric column with zero interquartile range has no measurable outliers and
  // must not dilute the rate. qualityFromProfiles() uses the same basis so the
  // score is identical whether it is computed here or rebuilt from storage.
  const outlierRate =
    outliers.size > 0 && rowCount > 0
      ? [...outliers.values()].reduce((a, b) => a + b, 0) /
        (rowCount * outliers.size)
      : 0;
  const validity = 1 - Math.min(1, outlierRate * 2);

  const score =
    (completeness * 0.4 + uniqueness * 0.25 + structure * 0.2 + validity * 0.15) *
    100;

  const quality: DatasetQuality = {
    score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10,
    rowCount,
    columnCount: rawColumns.length,
    duplicateRows,
    missingCells,
    totalCells,
    emptyColumns,
    constantColumns,
    issues: allIssues.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity] || b.affected - a.affected;
    }),
  };

  return { columns, profiles, quality };
}
