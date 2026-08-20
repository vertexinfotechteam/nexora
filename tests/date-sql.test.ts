import assert from "node:assert/strict";
import test from "node:test";

import { temporalExpr, truncTemporal } from "../src/lib/analysis/date-sql.ts";

/**
 * Reading a date column the engine stores as text.
 *
 * A forecast on a column of "Apr-25" used to fail the whole analysis with a
 * binder error, because the column is a date to a reader and VARCHAR to the
 * database. These tests pin the shape of the SQL; the companion check against
 * a live DuckDB proves it parses.
 */

test("the native cast is tried before any format guessing", () => {
  const sql = temporalExpr('"Month"');
  assert.ok(sql.indexOf("try_cast") < sql.indexOf("try_strptime"),
    "a column already stored as a date must not go through format matching");
});

test("nothing can throw on an unreadable value", () => {
  // try_ everywhere: one bad row must not take down the analysis.
  const sql = temporalExpr('"Month"');
  assert.ok(!/(?<!try_)\bcast\(/.test(sql), `a plain cast would throw: ${sql}`);
  assert.ok(!/(?<!try_)\bstrptime\(/.test(sql), `a plain strptime would throw: ${sql}`);
});

test("the formats business data actually arrives in are covered", () => {
  const sql = temporalExpr('"Month"');
  for (const format of ["%Y-%m-%d", "%b-%y", "%b %Y", "%Y-%m", "%d/%m/%Y"]) {
    assert.ok(sql.includes(`'${format}'`), `missing format ${format}`);
  }
});

test("day-first is tried before month-first", () => {
  // Both are real conventions and the pair is genuinely ambiguous; day-first
  // is the majority worldwide, so it wins. Recorded here because the order is
  // a decision, not an accident.
  const sql = temporalExpr('"d"');
  assert.ok(sql.indexOf("'%d/%m/%Y'") < sql.indexOf("'%m/%d/%Y'"));
});

test("only real granularities reach the SQL", () => {
  assert.ok(truncTemporal('"d"', "week").startsWith("date_trunc('week'"));
  // Anything else falls back rather than being interpolated.
  assert.ok(truncTemporal('"d"', "fortnight").startsWith("date_trunc('month'"));
  assert.ok(truncTemporal('"d"', "'); drop table x; --").startsWith("date_trunc('month'"));
});

test("the identifier is used as given, so callers must quote it", () => {
  assert.ok(truncTemporal('"order date"', "month").includes('"order date"'));
});

test("format matching is handed text, so a real DATE column still binds", () => {
  /*
   * try_strptime only accepts VARCHAR. Without the cast this expression fails
   * on a column that is already a proper DATE — breaking every well-formed
   * file in order to fix the awkward ones. The branch is never evaluated for
   * such a column, but SQL is bound before it runs, so it still has to
   * type-check. Caught by testing the good case as well as the broken one.
   */
  const sql = temporalExpr('"order_date"');
  const call = sql.slice(sql.indexOf("try_strptime("));
  assert.ok(
    call.includes('try_cast("order_date" as varchar)'),
    `try_strptime must be given text, got: ${call.slice(0, 80)}`,
  );
});
