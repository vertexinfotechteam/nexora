import "server-only";

import { getEngine, DATASET_TABLE, runQuery } from "@/lib/duckdb/engine";
import { materialize } from "@/lib/storage";
import { buildSourceExpression, detectFileKind } from "./source";
import type { Dataset, DatasetFile } from "@/lib/store/types";

/**
 * Loads a dataset into a sealed DuckDB engine and returns the engine key.
 *
 * The engine key is namespaced by organization so two tenants can never share
 * a loaded engine, even if a dataset id were somehow guessed.
 */
export function engineKeyFor(organizationId: string, datasetId: string): string {
  return `${organizationId}:${datasetId}`;
}

export async function ensureDatasetLoaded(
  dataset: Dataset,
  file: DatasetFile,
): Promise<string> {
  const key = engineKeyFor(dataset.organization_id, dataset.id);

  await getEngine(key, async () => {
    const localPath = await materialize(file.storage_path, dataset.id);
    const kind = detectFileKind(file.original_name);
    return buildSourceExpression(localPath, kind);
  });

  return key;
}

/** Row count straight from the loaded table. */
export async function countRows(engineKey: string): Promise<number> {
  const result = await runQuery(
    engineKey,
    `select count(*)::bigint as n from ${DATASET_TABLE}`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Paginated preview. Never loads the whole table into the browser. */
export async function previewRows(
  engineKey: string,
  offset: number,
  limit: number,
): Promise<{ columns: { name: string; type: string }[]; rows: Record<string, unknown>[] }> {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const safeOffset = Math.max(0, Math.min(1_000_000, offset));
  const result = await runQuery(
    engineKey,
    `select * from ${DATASET_TABLE} limit ${safeLimit} offset ${safeOffset}`,
    { maxRows: safeLimit },
  );
  return { columns: result.columns, rows: result.rows };
}
