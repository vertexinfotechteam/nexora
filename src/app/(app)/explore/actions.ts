"use server";

import { requireSession } from "@/lib/auth/session";
import { getDataset, getDatasetFile } from "@/lib/store";
import { ensureDatasetLoaded } from "@/lib/ingest/loader";
import { runQuery, DATASET_TABLE } from "@/lib/duckdb/engine";
import {
  AGGREGATIONS,
  buildExploreQuery,
  describeResult,
  ExploreError,
  isNumericType,
  type Aggregation,
  type ExploreRow,
} from "@/lib/analysis/explore";

/**
 * Runs one exploration.
 *
 * The dataset is fetched through the session, so a dataset id belonging to
 * another workspace resolves to nothing — the tenant check is the store's,
 * not a filter written here that could be forgotten.
 */

export type ExploreColumn = { name: string; type: string; numeric: boolean };

export type ExploreResult =
  | {
      ok: true;
      rows: ExploreRow[];
      valueLabel: string;
      groupColumn: string;
      explanation: string | null;
      sql: string;
      truncated: boolean;
    }
  | { ok: false; error: string };

/** Column list for the pickers, straight from the loaded table. */
export async function getExploreColumnsAction(
  datasetId: string,
): Promise<ExploreColumn[]> {
  const session = await requireSession();
  const dataset = await getDataset(session, datasetId);
  if (!dataset) return [];

  const file = await getDatasetFile(session, datasetId);
  if (!file) return [];

  const key = await ensureDatasetLoaded(dataset, file);
  const result = await runQuery(key, `select * from ${DATASET_TABLE} limit 0`);

  return result.columns.map((column) => ({
    name: column.name,
    type: column.type,
    numeric: isNumericType(column.type),
  }));
}

export async function runExploreAction(input: {
  datasetId: string;
  groupBy: string;
  measure: string | null;
  aggregation: Aggregation;
  sort: "value_desc" | "value_asc" | "label_asc";
  limit: number;
}): Promise<ExploreResult> {
  const session = await requireSession();

  if (!AGGREGATIONS.includes(input.aggregation)) {
    return { ok: false, error: "That is not a summary this page can calculate." };
  }

  const dataset = await getDataset(session, input.datasetId);
  if (!dataset) {
    return { ok: false, error: "That file could not be found." };
  }

  const file = await getDatasetFile(session, input.datasetId);
  if (!file) {
    return { ok: false, error: "That file has no stored contents." };
  }

  try {
    const key = await ensureDatasetLoaded(dataset, file);

    // The real column list, which is what the requested names are checked
    // against. Anything not in it is refused rather than escaped.
    const shape = await runQuery(key, `select * from ${DATASET_TABLE} limit 0`);
    const available = shape.columns.map((column) => column.name);

    const built = buildExploreQuery(
      {
        groupBy: input.groupBy,
        measure: input.measure,
        aggregation: input.aggregation,
        sort: input.sort,
        limit: input.limit,
      },
      available,
      DATASET_TABLE,
    );

    const result = await runQuery(key, built.sql);

    const rows: ExploreRow[] = result.rows.map((row) => ({
      label: row.label === null || row.label === undefined ? "(blank)" : String(row.label),
      value: Number(row.value ?? 0),
      rowCount: Number(row.row_count ?? 0),
    }));

    return {
      ok: true,
      rows,
      valueLabel: built.valueLabel,
      groupColumn: built.groupColumn,
      explanation: describeResult(rows, built, input.aggregation),
      sql: built.sql,
      truncated: rows.length >= Math.min(500, Math.max(1, input.limit)),
    };
  } catch (error) {
    if (error instanceof ExploreError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? `That did not run: ${error.message}`
          : "That did not run.",
    };
  }
}
