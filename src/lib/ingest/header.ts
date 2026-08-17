/**
 * Finding the real header row in a spreadsheet.
 *
 * Business workbooks are written for people, not parsers. A typical export
 * opens with a company name, a "Financial Year 2025-26" subtitle and a blank
 * line before the row that actually names the columns, and closes with a TOTAL
 * line. Taking row 1 as the header turns every column name into the report
 * title and every number into text, and the analysis that follows has nothing
 * to work with — no measures, no charts, no forecast.
 *
 * Pure and dependency-free so the heuristics below can be tested against real
 * shapes rather than reasoned about.
 */

/** Cells that carry no information. */
function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Whether a cell reads as a number.
 *
 * Deliberately generous: currency symbols, thousands separators (both western
 * and Indian grouping), percentages, parenthesised negatives and trailing
 * minus signs all still describe a quantity, and a header row containing them
 * is not a header row.
 */
export function looksNumeric(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const cleaned = text
    .replace(/^\(|\)$/g, "")
    .replace(/[₹$€£¥%]/g, "")
    .replace(/[,\s]/g, "")
    .replace(/-$/, "");
  if (!cleaned) return false;
  return /^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(cleaned);
}

/** Rows a spreadsheet appends after the data, which must not be analysed. */
const SUMMARY_LABEL =
  /^\s*(?:grand\s*total|total|totals|sum|subtotal|net\s*total|overall)\s*[:.]?\s*$/i;

/**
 * True when a row is a trailing summary rather than an observation.
 *
 * Kept narrow on purpose. A TOTAL row is an enormous outlier — it would
 * dominate every aggregate and register as an anomaly — but so would wrongly
 * discarding a real row, so this matches only an explicit label in the first
 * cell of a row whose remaining cells are numbers.
 */
export function isSummaryRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const [first, ...rest] = cells;
  if (!SUMMARY_LABEL.test(first ?? "")) return false;

  const filled = rest.filter((cell) => !isBlank(cell));
  if (filled.length === 0) return false;
  return filled.every(looksNumeric);
}

/**
 * Index of the row that names the columns.
 *
 * Scores each candidate against the shape a header actually has:
 *   - it is nearly as wide as the table, unlike a title sitting in one cell;
 *   - its cells are distinct, unlike a merged banner repeated across columns;
 *   - its cells are labels, not numbers;
 *   - and the row after it holds at least one number, which is what separates
 *     a header from the first line of a text column.
 *
 * Returns 0 when nothing scores better, so a plain tidy sheet is unaffected.
 */
export function detectHeaderRow(rows: string[][], searchLimit = 25): number {
  if (rows.length === 0) return 0;

  const limit = Math.min(rows.length, searchLimit);
  const width = Math.max(...rows.slice(0, limit).map((row) => row.length), 1);

  for (let index = 0; index < limit; index++) {
    const row = rows[index];
    const filled = row.filter((cell) => !isBlank(cell));

    // A title occupies one or two cells of a thirteen-column sheet.
    if (filled.length < Math.max(2, Math.ceil(width * 0.6))) continue;

    // A merged banner repeats the same text across the row.
    const distinct = new Set(filled.map((cell) => cell.trim().toLowerCase()));
    if (distinct.size < Math.ceil(filled.length * 0.8)) continue;

    // Headers name things; they do not measure them.
    const numeric = filled.filter(looksNumeric).length;
    if (numeric > Math.floor(filled.length * 0.3)) continue;

    // Something has to follow it, and that something has to look like data.
    const next = rows.slice(index + 1).find((candidate) =>
      candidate.some((cell) => !isBlank(cell)),
    );
    if (!next) continue;
    if (!next.some(looksNumeric)) continue;

    return index;
  }

  return 0;
}

export type SheetShape = {
  /** Row index of the header. */
  headerIndex: number;
  /** Header row plus data rows, with preamble and trailing totals removed. */
  rows: string[][];
  /** How many rows were dropped from the top, for the ingest note. */
  droppedAbove: number;
  /** How many trailing summary rows were dropped. */
  droppedSummary: number;
};

/**
 * Reduces a raw sheet to the table inside it.
 *
 * What was removed is reported rather than silently discarded — a user who
 * uploaded 17 rows and sees 12 analysed deserves to know which five went and
 * why.
 */
export function extractTable(rawRows: string[][]): SheetShape {
  const rows = rawRows.filter((row) => row.some((cell) => !isBlank(cell)));
  if (rows.length === 0) {
    return { headerIndex: 0, rows: [], droppedAbove: 0, droppedSummary: 0 };
  }

  const headerIndex = detectHeaderRow(rows);
  const kept = rows.slice(headerIndex);

  // Only trailing summaries are dropped. A "Total" appearing mid-sheet is more
  // likely a category name than a footer, and guessing there would lose data.
  let droppedSummary = 0;
  while (kept.length > 1 && isSummaryRow(kept[kept.length - 1])) {
    kept.pop();
    droppedSummary++;
  }

  return {
    headerIndex,
    rows: kept,
    droppedAbove: headerIndex,
    droppedSummary,
  };
}
