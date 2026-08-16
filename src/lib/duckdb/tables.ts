import "server-only";

import { getConnection } from "./engine";

/**
 * Asks DuckDB's own parser which tables a query touches.
 *
 * This is the permission check that cannot be fooled by formatting: it reads
 * the parsed statement rather than pattern-matching the text.
 */
export async function getTableNamesFor(
  engineKey: string,
  sql: string,
): Promise<string[]> {
  const connection = getConnection(engineKey);
  if (!connection) return [];
  return [...connection.getTableNames(sql, false)];
}
