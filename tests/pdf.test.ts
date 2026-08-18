import assert from "node:assert/strict";
import test from "node:test";

import { groupRunsIntoRows, tableToCsv } from "../src/lib/ingest/pdf.ts";

/**
 * Reconstructing rows and columns from positioned PDF text.
 *
 * This is the part that decides whether a number ends up under the right
 * heading, so the cases below are the layouts that would silently misalign a
 * column rather than fail outright.
 */

/** y descends down the page in these fixtures, matching PDF coordinates. */
const run = (text: string, x: number, y: number) => ({ text, x, y });

test("reads a simple grid top to bottom, left to right", () => {
  const rows = groupRunsIntoRows([
    // Deliberately out of order: a PDF lists runs in draw order, not reading
    // order, so the grouping must not depend on the input sequence.
    run("210000", 200, 700),
    run("Month", 40, 740),
    run("Revenue", 120, 740),
    run("Salary", 200, 740),
    run("Apr-25", 40, 700),
    run("520000", 120, 700),
  ]);

  assert.deepEqual(rows, [
    ["Month", "Revenue", "Salary"],
    ["Apr-25", "520000", "210000"],
  ]);
});

test("a baseline that wobbles slightly stays one row", () => {
  // Sub-point drift is common where a row mixes font sizes; splitting on it
  // would tear one row into several partial ones.
  const rows = groupRunsIntoRows([
    run("Apr-25", 40, 700),
    run("520000", 120, 701.4),
    run("210000", 200, 699.2),
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ["Apr-25", "520000", "210000"]);
});

test("a genuinely different line becomes its own row", () => {
  const rows = groupRunsIntoRows([
    run("Apr-25", 40, 700),
    run("May-25", 40, 686),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows, [["Apr-25"], ["May-25"]]);
});

test("runs that sit flush together are one cell, not two", () => {
  // PDFs routinely split a single word across runs for kerning. Treating each
  // fragment as a column would shift every value after it.
  const rows = groupRunsIntoRows([
    run("Mar", 40, 700),
    run("keting", 53, 700),
    run("14000", 200, 700),
  ]);

  assert.equal(rows[0].length, 2, "kerned fragments must not become columns");
  assert.equal(rows[0][1], "14000");
  assert.match(rows[0][0], /^Mar\s?keting$/);
});

test("blank runs are ignored rather than becoming empty columns", () => {
  const rows = groupRunsIntoRows([
    run("Apr-25", 40, 700),
    run("   ", 120, 700),
    run("520000", 200, 700),
  ]);
  assert.deepEqual(rows[0], ["Apr-25", "520000"]);
});

test("no runs gives no rows, rather than throwing", () => {
  assert.deepEqual(groupRunsIntoRows([]), []);
});

test("rows are padded to the widest, so columns stay aligned in the CSV", () => {
  // A short row would otherwise shift every later column left by one.
  const csv = tableToCsv([
    ["Month", "Revenue", "Net"],
    ["Apr-25", "520000"],
    ["May-25", "545000", "211000"],
  ]);

  assert.deepEqual(csv.split("\n"), [
    "Month,Revenue,Net",
    "Apr-25,520000,",
    "May-25,545000,211000",
  ]);
});

test("cells containing a comma or quote are escaped", () => {
  const csv = tableToCsv([
    ["Item", "Note"],
    ["Widget", "red, large"],
    ['Say "hi"', "ok"],
  ]);

  assert.match(csv, /"red, large"/);
  assert.match(csv, /"Say ""hi"""/);
});
