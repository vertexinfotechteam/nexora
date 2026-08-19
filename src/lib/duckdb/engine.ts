import "server-only";

import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { DATASET_TABLE } from "./constants";
import { SQL_LIMITS } from "@/lib/env";

/**
 * The analytical engine.
 *
 * Every dataset gets its own DuckDB instance. The instance is loaded with the
 * dataset file and then *sealed*: external access off, extension autoloading
 * off, configuration locked. After sealing, DuckDB itself refuses to touch the
 * filesystem or the network — the guarantee is enforced by the engine, not by
 * string matching on the query.
 */

export type QueryColumn = { name: string; type: string };

export type QueryResult = {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

export class QueryError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "syntax" | "runtime" = "runtime",
  ) {
    super(message);
    this.name = "QueryError";
  }
}

/** Table name the dataset is always loaded as. Referenced in AI prompts. */
// Defined in ./constants so modules needing only the name do not load
// this file, and with it the native binding. Re-exported here because every
// existing caller imports it from the engine.
export { DATASET_TABLE } from "./constants";

type Engine = {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  sealed: boolean;
  lastUsed: number;
};

const engines = new Map<string, Engine>();
const MAX_ENGINES = 8;
const ENGINE_IDLE_MS = 15 * 60 * 1000;

function evictStale() {
  const now = Date.now();
  for (const [key, engine] of engines) {
    if (now - engine.lastUsed > ENGINE_IDLE_MS) {
      closeEngine(key);
    }
  }
  while (engines.size > MAX_ENGINES) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, engine] of engines) {
      if (engine.lastUsed < oldest) {
        oldest = engine.lastUsed;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    closeEngine(oldestKey);
  }
}

export function closeEngine(key: string) {
  const engine = engines.get(key);
  if (!engine) return;
  engines.delete(key);
  try {
    engine.connection.closeSync();
    engine.instance.closeSync();
  } catch {
    // Already torn down; nothing to recover.
  }
}

/**
 * Reads the source file into a native DuckDB table, then seals the instance.
 * `sourceExpression` is built by the caller from a *validated* absolute path —
 * it is never influenced by AI output.
 */
async function createSealedEngine(
  key: string,
  sourceExpression: string,
): Promise<Engine> {
  const instance = await DuckDBInstance.create(":memory:", {
    memory_limit: "2GB",
    threads: "2",
    max_expression_depth: "500",
  });
  const connection = await instance.connect();

  try {
    // Load happens while external access is still permitted.
    await connection.run(
      `create table ${DATASET_TABLE} as select * from ${sourceExpression}`,
    );

    // Seal. Order matters: lock_configuration must be last.
    await connection.run("set enable_external_access=false");
    await connection.run("set autoinstall_known_extensions=false");
    await connection.run("set autoload_known_extensions=false");
    await connection.run("set allow_community_extensions=false");
    await connection.run("set lock_configuration=true");
  } catch (error) {
    try {
      connection.closeSync();
      instance.closeSync();
    } catch {
      /* ignore */
    }
    throw error;
  }

  const engine: Engine = {
    instance,
    connection,
    sealed: true,
    lastUsed: Date.now(),
  };
  engines.set(key, engine);
  evictStale();
  return engine;
}

export async function getEngine(
  key: string,
  sourceExpression: () => Promise<string>,
): Promise<Engine> {
  const existing = engines.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }
  return createSealedEngine(key, await sourceExpression());
}

export function hasEngine(key: string): boolean {
  return engines.has(key);
}

/** Raw connection, for parser-level inspection only. Never for user SQL. */
export function getConnection(key: string): DuckDBConnection | null {
  return engines.get(key)?.connection ?? null;
}

/**
 * Runs a query against a sealed engine with a hard wall-clock timeout.
 *
 * DuckDB has no server-side statement timeout, so the timeout is enforced by
 * `interrupt()` — which aborts the running query inside the engine rather than
 * merely abandoning the promise.
 */
export async function runQuery(
  key: string,
  sql: string,
  options: { timeoutMs?: number; maxRows?: number } = {},
): Promise<QueryResult> {
  const engine = engines.get(key);
  if (!engine) {
    throw new QueryError("Analysis engine is not loaded for this dataset.");
  }
  engine.lastUsed = Date.now();

  const timeoutMs = options.timeoutMs ?? SQL_LIMITS.timeoutMs;
  const maxRows = options.maxRows ?? SQL_LIMITS.maxRows;
  const started = performance.now();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      engine.connection.interrupt();
    } catch {
      /* connection already finished */
    }
  }, timeoutMs);

  try {
    // Fetch one extra row so truncation can be reported honestly.
    const reader = await engine.connection.runAndReadUntil(sql, maxRows + 1);
    const names = reader.deduplicatedColumnNames();
    const types = reader.columnTypes().map((t) => t.toString());
    const all = reader.getRowObjectsJson() as Record<string, unknown>[];
    const truncated = all.length > maxRows;
    const rows = truncated ? all.slice(0, maxRows) : all;

    return {
      columns: names.map((name, i) => ({ name, type: types[i] ?? "UNKNOWN" })),
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (timedOut) {
      throw new QueryError(
        `Query exceeded the ${Math.round(timeoutMs / 1000)}s time limit and was cancelled.`,
        "timeout",
      );
    }
    throw new QueryError(message, /Parser Error|Binder Error/i.test(message) ? "syntax" : "runtime");
  } finally {
    clearTimeout(timer);
  }
}

/** Quotes an identifier for safe interpolation into generated SQL. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quotes a string literal for safe interpolation into generated SQL. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
