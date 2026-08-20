import assert from "node:assert/strict";
import test from "node:test";

import { assessTable } from "../src/lib/ingest/header.ts";

/**
 * Telling a table apart from a page of notes.
 *
 * Header detection is built to find a header, not to doubt that a table
 * exists, so a spreadsheet of scattered notes passes straight through it and
 * becomes a dataset of NULL rows under columns named column0 and column2. The
 * analysis then runs on nothing and the answer looks broken, with nothing
 * pointing at the file.
 *
 * These cases are drawn from the file that caused it and from the ordinary
 * exports that must keep working.
 */

test("a page of notes is refused", () => {
  // The shape of the real Book1.xlsx: ten columns, two filled per row, the
  // rest empty from top to bottom.
  const notes = [
    ["", "ASK AI - ABOUT DATASET", "", "", "", "", "", "", "", "OTH:"],
    ["", "", "", "", "", "", "", "*", "", "SUGGESTED ACTIONS"],
    ["", "", "", "", "", "", "", "*", "", "Unusual Activity"],
    ["", "", "", "", "", "", "", "", "", "Active All 3"],
  ];
  const verdict = assessTable(notes);
  assert.equal(verdict.usable, false);
  assert.match(verdict.reason ?? "", /completely empty|not enough data/i);
});

test("an ordinary export is accepted", () => {
  const sales = [
    ["region", "product", "units", "revenue"],
    ["North", "Alpha", "12", "4200"],
    ["South", "Beta", "8", "2600"],
    ["East", "Gamma", "15", "5100"],
  ];
  assert.equal(assessTable(sales).usable, true);
});

test("an export with some blanks is still accepted", () => {
  // Optional fields are left empty all the time; that must not be mistaken
  // for a notes page.
  const withGaps = [
    ["customer", "email", "phone", "notes"],
    ["Asha", "asha@example.com", "", ""],
    ["Bilal", "bilal@example.com", "555-1234", "repeat"],
    ["Chetan", "", "555-9876", ""],
  ];
  assert.equal(assessTable(withGaps).usable, true, "blank optional fields are normal");
});

test("a narrow table is judged on density, not on empty columns", () => {
  // Two columns of three being empty would trip the column rule, so it only
  // applies from four columns up — a three-column table is too small to judge
  // that way.
  const narrow = [
    ["month", "total"],
    ["Jan", "1200"],
    ["Feb", "1450"],
  ];
  assert.equal(assessTable(narrow).usable, true);
});

test("headings with no rows underneath are refused", () => {
  assert.equal(assessTable([["a", "b", "c", "d"]]).usable, false);
  assert.equal(assessTable([]).usable, false);
});

test("the verdict reports what it measured, so the message can be specific", () => {
  const verdict = assessTable([
    ["a", "b", "c", "d", "e", "f"],
    ["1", "", "", "", "", ""],
    ["2", "", "", "", "", ""],
  ]);
  assert.equal(verdict.usable, false);
  assert.equal(verdict.totalColumns, 6);
  assert.equal(verdict.emptyColumns, 5);
  assert.ok(verdict.reason?.includes("5 of the 6"), `reason should name the counts: ${verdict.reason}`);
});
