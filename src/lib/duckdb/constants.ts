/**
 * Names shared between the engine and the code that writes SQL for it.
 *
 * These live apart from engine.ts because that module imports the DuckDB
 * native binding at load time. Anything reaching for one of these constants
 * would otherwise pull the whole database in with it — which is how the
 * public assistant, a route that never touches a dataset, came to fail on a
 * host with no DuckDB binary present. A constant should not carry a
 * dependency, so it does not live in a file that has one.
 *
 * No imports belong in this file.
 */

/** The single table every uploaded dataset is loaded into. */
export const DATASET_TABLE = "dataset";

/** Quotes an identifier (a column or table name) for generated SQL. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quotes a string literal for safe interpolation into generated SQL. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
