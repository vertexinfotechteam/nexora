import assert from "node:assert/strict";
import test from "node:test";

import {
  collectComputedValues,
  deterministicNarrative,
  verifyNarrative,
} from "../src/lib/ai/verify.ts";
import {
  enforceRowLimit,
  validateSql,
  checkTablePermissions,
} from "../src/lib/duckdb/sql-guard.ts";

// ---------------------------------------------------------------------------
// Result integrity
// ---------------------------------------------------------------------------

const FIGURES = [
  { label: "Total revenue", value: 124560 },
  { label: "Change vs previous period", value: 18.63 },
  { label: "Top category", value: "Electronics" },
];

test("accepts a narrative whose numbers all come from computation", () => {
  const result = verifyNarrative(
    "Revenue reached 124,560 this period, an increase of 18.6% over the previous period.",
    FIGURES,
  );
  assert.equal(result.ok, true);
  assert.equal(result.unverified.length, 0);
});

test("rejects an invented figure", () => {
  const result = verifyNarrative(
    "Revenue reached 124,560, driven by a 47.2% jump in new customers.",
    FIGURES,
  );
  assert.equal(result.ok, false);
  assert.equal(result.unverified.length, 1);
  assert.equal(result.unverified[0].raw, "47.2%");
});

test("rejects a plausible-looking rescale of a real figure", () => {
  // 1,245,600 is 10x the real number — exactly the kind of slip that must fail.
  const result = verifyNarrative("Revenue reached 1,245,600.", FIGURES);
  assert.equal(result.ok, false);
});

test("accepts compact magnitude notation for a real figure", () => {
  const result = verifyNarrative("Revenue was about 124.6k this period.", FIGURES);
  assert.equal(result.ok, true);
});

test("treats ratios and percentages as the same claim", () => {
  const result = verifyNarrative(
    "Conversion sits at 3.4%.",
    [{ label: "Conversion", value: 0.034 }],
  );
  assert.equal(result.ok, true);
});

test("allows ordinary prose numbers but not decorated ones", () => {
  const ok = verifyNarrative("The top 3 categories drove most of the change in 2025.", FIGURES);
  assert.equal(ok.ok, true);

  const notOk = verifyNarrative("Margins improved by 3%.", FIGURES);
  assert.equal(notOk.ok, false, "a percentage must be computed even when small");
});

test("allows numbers the user supplied in the question", () => {
  const result = verifyNarrative(
    "Here is the forecast for the next 36 months.",
    [],
    [],
    "Forecast the next 36 months",
  );
  assert.equal(result.ok, true);
});

test("collectComputedValues digs numbers out of rows and formatted strings", () => {
  const values = collectComputedValues(
    [{ label: "Revenue", value: "$1,234.50" }],
    [[{ month: "2025-01", total: 987.65 }]],
  );
  assert.ok(values.includes(1234.5));
  assert.ok(values.includes(987.65));
});

test("deterministicNarrative never contains an unverified number", () => {
  const narrative = deterministicNarrative("What is revenue?", FIGURES, 42);
  const result = verifyNarrative(narrative, FIGURES, [], "What is revenue?");
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// SQL guard
// ---------------------------------------------------------------------------

test("allows a normal analytical query", () => {
  const result = validateSql(
    `select date_trunc('month', "order_date") as month, sum(amount) as total
     from dataset group by 1 order by 1`,
  );
  assert.equal(result.ok, true);
});

test("allows a CTE", () => {
  const result = validateSql(
    "with monthly as (select 1 as a) select * from monthly",
  );
  assert.equal(result.ok, true);
});

for (const statement of [
  "drop table dataset",
  "delete from dataset",
  "update dataset set amount = 0",
  "insert into dataset values (1)",
  "alter table dataset add column x int",
  "truncate dataset",
  "create table evil as select 1",
  "attach 'other.db' as other",
  "install httpfs",
  "load httpfs",
  "copy dataset to 'out.csv'",
  "pragma database_list",
  "set enable_external_access=true",
]) {
  test(`blocks: ${statement}`, () => {
    const result = validateSql(statement);
    assert.equal(result.ok, false, `expected "${statement}" to be blocked`);
  });
}

test("blocks a second statement smuggled after a semicolon", () => {
  const result = validateSql("select 1; drop table dataset");
  assert.equal(result.ok, false);
  assert.equal(result.violation, "multiple_statements");
});

test("blocks keywords hidden behind a comment", () => {
  const result = validateSql("select 1 /* harmless */ ; drop table dataset --");
  assert.equal(result.ok, false);
});

test("blocks external file readers even though the engine also blocks them", () => {
  const result = validateSql("select * from read_csv('C:/Windows/win.ini')");
  assert.equal(result.ok, false);
  assert.equal(result.violation, "read_csv");
});

test("does not trip on a keyword inside a string literal", () => {
  const result = validateSql(
    "select count(*) as n from dataset where status = 'delete pending'",
  );
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
});

test("does not trip on a column named like a keyword", () => {
  const result = validateSql('select "update_count" from dataset');
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
});

test("allows the replace() scalar function", () => {
  const result = validateSql(
    "select replace(\"name\", 'a', 'b') as cleaned from dataset",
  );
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
});

test("table permission check rejects unknown tables", () => {
  assert.equal(checkTablePermissions(["dataset"]).ok, true);
  assert.equal(checkTablePermissions(["auth.users"]).ok, false);
  assert.equal(checkTablePermissions(["dataset", "secrets"]).ok, false);
});

test("enforceRowLimit wraps only unbounded queries", () => {
  const wrapped = enforceRowLimit("select * from dataset", 500);
  assert.match(wrapped, /limit 500/);

  const untouched = "select * from dataset limit 10";
  assert.equal(enforceRowLimit(untouched, 500), untouched);
});
