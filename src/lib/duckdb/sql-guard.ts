import "server-only";

import { DATASET_TABLE } from "./engine";

/**
 * Validation gate every AI-generated query must pass before it reaches DuckDB.
 *
 *   AI SQL -> strip comments/strings -> single statement -> read-only shape
 *          -> forbidden keywords -> forbidden functions -> table allow-list
 *
 * The engine sandbox (see engine.ts) is the real security boundary; this layer
 * exists so violations are caught early, reported clearly, and shown to the
 * user in the activity stream rather than surfacing as opaque engine errors.
 */

export type GuardResult =
  | { ok: true; sql: string; tables: string[] }
  | { ok: false; reason: string; violation: string };

/** Statement types that may never appear, per the product spec. */
const FORBIDDEN_KEYWORDS = [
  "drop",
  "delete",
  "update",
  "insert",
  "alter",
  "truncate",
  "create",
  "attach",
  "detach",
  "install",
  "load",
  "copy",
  "export",
  "import",
  "call",
  "pragma",
  "set",
  "reset",
  "grant",
  "revoke",
  "vacuum",
  "checkpoint",
  "replace",
  "merge",
  "upsert",
] as const;

/**
 * Functions that reach outside the query engine. `enable_external_access=false`
 * already blocks these, but rejecting them here produces a readable message.
 */
const FORBIDDEN_FUNCTIONS = [
  "read_csv",
  "read_csv_auto",
  "read_parquet",
  "read_json",
  "read_json_auto",
  "read_ndjson",
  "read_text",
  "read_blob",
  "glob",
  "parquet_scan",
  "json_scan",
  "csv_scan",
  "sniff_csv",
  "duckdb_settings",
  "duckdb_extensions",
  "shell",
  "system",
  "getenv",
  "postgres_scan",
  "mysql_scan",
  "sqlite_scan",
  "iceberg_scan",
  "delta_scan",
  "httpfs",
  "url_encode",
] as const;

/** Tables an AI query is allowed to reference. */
const ALLOWED_TABLES = new Set([DATASET_TABLE]);

/**
 * Removes comments and string/identifier literals, replacing each with a space
 * so keyword scanning cannot be fooled by `SELECT 'drop table x'` or by
 * `/* drop *​/`-style comment tricks.
 */
function stripLiteralsAndComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // Block comment (DuckDB does not nest these)
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    // Single-quoted string
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += " ? ";
      continue;
    }
    // Double-quoted identifier — keep it, but neutralised, so a column named
    // "delete_flag" cannot trip the keyword scan.
    if (ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      out += " ident ";
      continue;
    }
    // Dollar-quoted string
    if (ch === "$" && sql.slice(i).match(/^\$[a-zA-Z_]*\$/)) {
      const tag = sql.slice(i).match(/^\$[a-zA-Z_]*\$/)![0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? n : end + tag.length;
      out += " ? ";
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function tokenize(stripped: string): string[] {
  return stripped.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
}

export function validateSql(rawSql: string): GuardResult {
  const sql = rawSql.trim().replace(/;+\s*$/, "");

  if (!sql) {
    return { ok: false, reason: "The query was empty.", violation: "empty" };
  }
  if (sql.length > 20_000) {
    return {
      ok: false,
      reason: "The query is too long to be executed safely.",
      violation: "length",
    };
  }

  const stripped = stripLiteralsAndComments(sql);

  // 1. Exactly one statement.
  if (stripped.includes(";")) {
    return {
      ok: false,
      reason:
        "Only a single statement may be executed. Multiple statements are not allowed.",
      violation: "multiple_statements",
    };
  }

  // 2. Read-only shape: must begin with SELECT, WITH, TABLE, FROM or DESCRIBE.
  const firstWord = stripped.trim().replace(/^\(+/, "").match(/^[a-zA-Z_]+/)?.[0]?.toLowerCase();
  if (!firstWord || !["select", "with", "table", "from", "describe", "summarize"].includes(firstWord)) {
    return {
      ok: false,
      reason: `Only read-only queries are permitted. The query starts with "${firstWord ?? "?"}".`,
      violation: "not_read_only",
    };
  }

  const tokens = tokenize(stripped);
  const tokenSet = new Set(tokens);

  // 3. Forbidden statement keywords.
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (tokenSet.has(keyword)) {
      // `replace` is also a legitimate scalar function and `select * replace(...)`
      // clause; allow it only when directly followed by "(".
      if (keyword === "replace" && /\breplace\s*\(/i.test(stripped)) continue;
      return {
        ok: false,
        reason: `The keyword "${keyword.toUpperCase()}" is not allowed. Queries must only read data.`,
        violation: keyword,
      };
    }
  }

  // 4. Forbidden functions.
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (tokenSet.has(fn)) {
      return {
        ok: false,
        reason: `The function "${fn}()" is not available. Queries may only read the loaded dataset.`,
        violation: fn,
      };
    }
  }

  return { ok: true, sql, tables: [] };
}

/**
 * Second-stage permission check, run after `validateSql` passes.
 * `referencedTables` comes from DuckDB's own parser, so it cannot be spoofed by
 * creative formatting the way a regex scan can.
 */
export function checkTablePermissions(referencedTables: string[]): GuardResult {
  for (const table of referencedTables) {
    const bare = table.split(".").pop()?.replace(/"/g, "").toLowerCase() ?? "";
    if (!ALLOWED_TABLES.has(bare)) {
      return {
        ok: false,
        reason: `The query references "${table}", which is not part of this dataset. Only "${DATASET_TABLE}" may be queried.`,
        violation: "table_not_allowed",
      };
    }
  }
  return { ok: true, sql: "", tables: referencedTables };
}

/**
 * Appends a LIMIT when the AI omitted one, so a careless `SELECT *` cannot pull
 * the whole table through the app. Queries that already limit are left alone.
 */
export function enforceRowLimit(sql: string, maxRows: number): string {
  const stripped = stripLiteralsAndComments(sql).toLowerCase();
  if (/\blimit\b/.test(stripped)) return sql;
  return `select * from (${sql.replace(/;+\s*$/, "")}) as guarded_query limit ${maxRows}`;
}
