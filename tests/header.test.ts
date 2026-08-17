import assert from "node:assert/strict";
import test from "node:test";

import {
  detectHeaderRow,
  extractTable,
  isSummaryRow,
  looksNumeric,
} from "../src/lib/ingest/header.ts";

/**
 * Header detection.
 *
 * The shape that motivated this is the first case below: a real financial
 * export whose columns were being named after the report title, which left the
 * analysis with no measures and produced an empty report.
 */

test("finds the header under a title block, as real exports are written", () => {
  const rows = [
    ["Vertex Infotech Pvt Ltd", "", "", "", ""],
    ["Financial Year 2025-26", "", "", "", ""],
    ["", "", "", "", ""],
    ["Month", "Revenue", "Salary", "Marketing", "Net"],
    ["Apr-25", "520000", "210000", "12000", "195000"],
    ["May-25", "545000", "210000", "14000", "211000"],
  ];
  // Blank rows are removed first, so the header is at index 2 of what remains.
  const shape = extractTable(rows);
  assert.deepEqual(shape.rows[0], ["Month", "Revenue", "Salary", "Marketing", "Net"]);
  assert.equal(shape.droppedAbove, 2);
  assert.equal(shape.rows.length, 3);
});

test("a tidy sheet with no preamble is left alone", () => {
  const rows = [
    ["date", "product", "units", "revenue"],
    ["2025-01-01", "Widget", "3", "1500"],
    ["2025-01-02", "Gadget", "5", "2750"],
  ];
  assert.equal(detectHeaderRow(rows), 0);
  const shape = extractTable(rows);
  assert.equal(shape.droppedAbove, 0);
  assert.equal(shape.droppedSummary, 0);
  assert.deepEqual(shape.rows, rows);
});

test("a merged banner repeated across the row is not mistaken for a header", () => {
  // Some exporters repeat the merged value into every cell rather than
  // leaving the others empty, which defeats a width-only check.
  const rows = [
    ["Annual Report", "Annual Report", "Annual Report", "Annual Report"],
    ["Month", "Revenue", "Cost", "Profit"],
    ["Apr", "100", "60", "40"],
  ];
  assert.equal(detectHeaderRow(rows), 1);
});

test("a row of numbers is never chosen as the header", () => {
  const rows = [
    ["2025", "2026", "2027", "2028"],
    ["Region", "Q1", "Q2", "Q3"],
    ["North", "10", "20", "30"],
  ];
  assert.equal(detectHeaderRow(rows), 1);
});

test("a header needs data under it, not more prose", () => {
  const rows = [
    ["Notes", "Prepared by", "Reviewed by", "Approved by"],
    ["Draft", "Priya", "Amit", "Sunita"],
    ["Month", "Revenue", "Cost", "Profit"],
    ["Apr", "100", "60", "40"],
  ];
  // The first row is wide, distinct and non-numeric, but nothing numeric
  // follows it — the real header is the one with numbers beneath.
  assert.equal(detectHeaderRow(rows), 2);
});

test("trailing TOTAL rows are dropped", () => {
  const rows = [
    ["Month", "Revenue", "Cost"],
    ["Apr", "100", "60"],
    ["May", "120", "70"],
    ["TOTAL", "220", "130"],
  ];
  const shape = extractTable(rows);
  assert.equal(shape.droppedSummary, 1);
  assert.equal(shape.rows.length, 3);
  assert.deepEqual(shape.rows[shape.rows.length - 1], ["May", "120", "70"]);
});

test("a mid-sheet Total is kept, because it is probably a category", () => {
  const rows = [
    ["Category", "Amount"],
    ["Total Outgoing", "4422000"],
    ["Net Operating", "3153000"],
  ];
  const shape = extractTable(rows);
  assert.equal(shape.droppedSummary, 0);
  assert.equal(shape.rows.length, 3);
});

test("a row labelled Total but holding text is not a summary", () => {
  assert.equal(isSummaryRow(["Total", "pending", "review"]), false);
  assert.equal(isSummaryRow(["Total", "220", "130"]), true);
  assert.equal(isSummaryRow(["Grand Total", "1,20,000"]), true);
  assert.equal(isSummaryRow(["Totally different", "5"]), false);
});

test("numbers are recognised in the formats spreadsheets actually use", () => {
  for (const value of ["1200", "1,200", "1,25,000", "₹45,000", "12.5", "-8", "(500)", "45%", "1.2e3", "500-"]) {
    assert.equal(looksNumeric(value), true, value);
  }
  for (const value of ["Month", "Apr-25", "", "  ", "N/A", "Q1 2025"]) {
    assert.equal(looksNumeric(value), false, value);
  }
});

test("an empty sheet does not throw", () => {
  const shape = extractTable([]);
  assert.deepEqual(shape.rows, []);
  assert.equal(shape.headerIndex, 0);
});
