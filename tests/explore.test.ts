import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExploreQuery,
  describeResult,
  ExploreError,
  isNumericType,
  type ExploreRequest,
} from "../src/lib/analysis/explore.ts";

/**
 * Explore's query builder.
 *
 * The column names reach this code from the browser, so the injection cases
 * below are the point of the file, not an afterthought.
 */

const COLUMNS = ["Month", "Revenue", "Salary", "Region"];

const base: ExploreRequest = {
  groupBy: "Month",
  measure: "Revenue",
  aggregation: "sum",
  sort: "value_desc",
  limit: 25,
};

test("builds a grouped aggregate over the chosen columns", () => {
  const built = buildExploreQuery(base, COLUMNS);
  assert.match(built.sql, /select "Month" as label/);
  assert.match(built.sql, /sum\("Revenue"\) as value/);
  assert.match(built.sql, /group by "Month"/);
  assert.equal(built.groupColumn, "Month");
  assert.equal(built.measureColumn, "Revenue");
});

test("a column that is not in the dataset is refused, not escaped", () => {
  // The whole defence: an unknown name never reaches the SQL at all.
  assert.throws(
    () => buildExploreQuery({ ...base, groupBy: "Secret" }, COLUMNS),
    ExploreError,
  );
  assert.throws(
    () => buildExploreQuery({ ...base, measure: "Secret" }, COLUMNS),
    ExploreError,
  );
});

test("injection attempts are refused because they match no column", () => {
  const attacks = [
    `Month" ; drop table dataset; --`,
    `Revenue) , (select password from users`,
    `*`,
    `1=1`,
    `Month"--`,
  ];
  for (const attack of attacks) {
    assert.throws(
      () => buildExploreQuery({ ...base, groupBy: attack }, COLUMNS),
      ExploreError,
      attack,
    );
    assert.throws(
      () => buildExploreQuery({ ...base, measure: attack }, COLUMNS),
      ExploreError,
      attack,
    );
  }
});

test("a real column containing a quote is escaped, not rejected", () => {
  // Legitimate if unusual. Doubling the quote keeps the identifier closed.
  const built = buildExploreQuery(
    { ...base, groupBy: 'Odd"Name', measure: "Revenue" },
    ['Odd"Name', "Revenue"],
  );
  assert.match(built.sql, /"Odd""Name"/);
});

test("column matching ignores case but returns the real name", () => {
  const built = buildExploreQuery(
    { ...base, groupBy: "month", measure: "revenue" },
    COLUMNS,
  );
  assert.equal(built.groupColumn, "Month");
  assert.equal(built.measureColumn, "Revenue");
  assert.match(built.sql, /"Month"/);
});

test("counting rows needs no measure", () => {
  const built = buildExploreQuery(
    { ...base, aggregation: "count", measure: null },
    COLUMNS,
  );
  assert.match(built.sql, /count\(\*\) as value/);
  assert.equal(built.measureColumn, null);
  assert.equal(built.valueLabel, "Number of rows");
});

test("every other aggregation requires a measure", () => {
  assert.throws(
    () => buildExploreQuery({ ...base, aggregation: "sum", measure: null }, COLUMNS),
    ExploreError,
  );
});

test("an unknown aggregation is refused", () => {
  assert.throws(
    () =>
      buildExploreQuery(
        { ...base, aggregation: "; drop table dataset" as never },
        COLUMNS,
      ),
    ExploreError,
  );
});

test("the row limit is clamped to a sane range", () => {
  assert.match(buildExploreQuery({ ...base, limit: 100_000 }, COLUMNS).sql, /limit 500/);
  assert.match(buildExploreQuery({ ...base, limit: 0 }, COLUMNS).sql, /limit 25/);
  assert.match(buildExploreQuery({ ...base, limit: -5 }, COLUMNS).sql, /limit 1/);
  assert.match(buildExploreQuery({ ...base, limit: 10 }, COLUMNS).sql, /limit 10/);
});

test("numeric types are recognised for the measure picker", () => {
  for (const type of ["BIGINT", "DOUBLE", "DECIMAL(18,2)", "integer", "FLOAT"]) {
    assert.equal(isNumericType(type), true, type);
  }
  for (const type of ["VARCHAR", "DATE", "TIMESTAMP", "BOOLEAN"]) {
    assert.equal(isNumericType(type), false, type);
  }
});

test("the explanation only claims what the numbers support", () => {
  const built = buildExploreQuery(base, COLUMNS);
  const rows = [
    { label: "Mar", value: 300, rowCount: 1 },
    { label: "Feb", value: 100, rowCount: 1 },
    { label: "Jan", value: 100, rowCount: 1 },
  ];
  const text = describeResult(rows, built, "sum")!;
  assert.match(text, /highest .* is Mar/);
  assert.match(text, /60%/); // 300 of 500

  // A share of total is meaningless for an average, so it is not claimed.
  assert.doesNotMatch(describeResult(rows, built, "avg")!, /%/);

  // Negative values do not form a whole either.
  const mixed = [
    { label: "A", value: 50, rowCount: 1 },
    { label: "B", value: -20, rowCount: 1 },
  ];
  assert.doesNotMatch(describeResult(mixed, built, "sum")!, /%/);

  assert.equal(describeResult([], built, "sum"), null);
});
