/**
 * Query building for Explore.
 *
 * The user picks a column to group by, a column to measure and how to
 * aggregate it. Those choices arrive from the browser, so they are treated as
 * untrusted: nothing here is interpolated into SQL until it has been matched
 * against the column list the engine reported for that dataset.
 *
 * That check is the security boundary, and it is why this file is pure and
 * dependency-free — the rule is testable on its own rather than inferred from
 * the handler that happens to call it.
 */

export const AGGREGATIONS = ["sum", "avg", "count", "min", "max", "median"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: "Total",
  avg: "Average",
  count: "How many",
  min: "Lowest",
  max: "Highest",
  median: "Middle value",
};

export type ExploreRequest = {
  groupBy: string;
  measure: string | null;
  aggregation: Aggregation;
  sort: "value_desc" | "value_asc" | "label_asc";
  limit: number;
};

export class ExploreError extends Error {}

/** DuckDB types that can be summed or averaged. */
const NUMERIC_TYPES =
  /^(tinyint|smallint|integer|bigint|hugeint|utinyint|usmallint|uinteger|ubigint|float|double|decimal|numeric|real)/i;

export function isNumericType(type: string): boolean {
  return NUMERIC_TYPES.test(type.trim());
}

/**
 * Escapes an identifier for DuckDB.
 *
 * Only ever applied to a name that has already been matched against the real
 * column list; it is the second line of defence, not the first. A quoted
 * identifier cannot end the quoting early because embedded quotes are doubled.
 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Resolves a requested column against the columns the engine actually
 * reported, comparing case-insensitively so a user's capitalisation does not
 * matter. Returns the real name, never the requested one.
 */
function resolveColumn(requested: string, available: string[]): string {
  const wanted = requested.trim().toLowerCase();
  const match = available.find((name) => name.toLowerCase() === wanted);
  if (!match) {
    throw new ExploreError(`There is no column called "${requested}" in this file.`);
  }
  return match;
}

export type BuiltQuery = {
  sql: string;
  /** Column heading for the aggregated value. */
  valueLabel: string;
  groupColumn: string;
  measureColumn: string | null;
};

/**
 * Builds the SELECT for one exploration.
 *
 * `available` must be the column list the engine reported for this dataset.
 * Anything not in it is refused rather than escaped and passed through.
 */
export function buildExploreQuery(
  request: ExploreRequest,
  available: string[],
  table = "dataset",
): BuiltQuery {
  if (available.length === 0) {
    throw new ExploreError("This dataset has no columns to explore.");
  }

  const groupColumn = resolveColumn(request.groupBy, available);

  if (!AGGREGATIONS.includes(request.aggregation)) {
    throw new ExploreError("That is not a summary this page can calculate.");
  }

  // Counting rows needs no measure; everything else does.
  const needsMeasure = request.aggregation !== "count";
  let measureColumn: string | null = null;

  if (needsMeasure) {
    if (!request.measure) {
      throw new ExploreError("Choose a number to summarise.");
    }
    measureColumn = resolveColumn(request.measure, available);
  }

  const limit = Math.min(500, Math.max(1, Math.trunc(request.limit) || 25));

  const value = measureColumn
    ? `${request.aggregation}(${quoteIdent(measureColumn)})`
    : "count(*)";

  const orderBy =
    request.sort === "label_asc"
      ? `${quoteIdent(groupColumn)} asc`
      : request.sort === "value_asc"
        ? "value asc nulls last"
        : "value desc nulls last";

  const sql = [
    `select ${quoteIdent(groupColumn)} as label,`,
    `       ${value} as value,`,
    `       count(*) as row_count`,
    `from ${table}`,
    `where ${quoteIdent(groupColumn)} is not null`,
    `group by ${quoteIdent(groupColumn)}`,
    `order by ${orderBy}`,
    `limit ${limit}`,
  ].join("\n");

  return {
    sql,
    valueLabel: measureColumn
      ? `${AGGREGATION_LABELS[request.aggregation]} of ${measureColumn}`
      : "Number of rows",
    groupColumn,
    measureColumn,
  };
}

export type ExploreRow = { label: string; value: number; rowCount: number };

/**
 * A sentence describing what the result shows.
 *
 * Written from the computed rows, so it cannot claim anything the numbers do
 * not support — the same rule the rest of the product follows. Returns null
 * when there is nothing worth saying rather than padding the page.
 */
export function describeResult(
  rows: ExploreRow[],
  built: BuiltQuery,
  aggregation: Aggregation,
): string | null {
  if (rows.length === 0) return null;

  const measured = built.measureColumn
    ? `${AGGREGATION_LABELS[aggregation].toLowerCase()} of ${built.measureColumn}`
    : "number of rows";

  if (rows.length === 1) {
    return `Every row has the same ${built.groupColumn}, so there is only one group to compare.`;
  }

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  const parts = [
    `Grouped by ${built.groupColumn}, the highest ${measured} is ${top.label} and the lowest is ${bottom.label}.`,
  ];

  // Share of total is only meaningful for a sum of non-negative values;
  // averages and mixed signs do not add up to a whole.
  if (aggregation === "sum" && rows.every((row) => row.value >= 0)) {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total > 0) {
      const share = Math.round((top.value / total) * 100);
      parts.push(`${top.label} accounts for ${share}% of the total shown.`);
    }
  }

  return parts.join(" ");
}
