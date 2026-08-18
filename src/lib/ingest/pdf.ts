import "server-only";

import { extractTable } from "./header";

/**
 * Pulling a table out of a PDF.
 *
 * A PDF has no table structure. It is a page of text runs, each placed at an
 * x/y coordinate, and the rows and columns a human sees are an artefact of
 * that placement. Recovering them means grouping runs by their vertical
 * position into rows, then ordering each row by horizontal position.
 *
 * That reconstruction is inherently a guess, which matters more here than it
 * would elsewhere: this product's whole promise is that a figure was computed
 * from real data. So the rules below are conservative, and anything that does
 * not clearly look like a table is refused with a message saying so, rather
 * than turned into rows that quietly mean nothing.
 */

/** One text run with the position the PDF gave it. */
type Run = { text: string; x: number; y: number };

/**
 * Runs whose baselines are within this many points are treated as one row.
 *
 * Typical body text is 9-11pt on 12-14pt leading, so a couple of points of
 * drift is the same line and anything larger is the next one.
 */
const ROW_TOLERANCE = 3;

/** A gap wider than this between runs starts a new column. */
const COLUMN_GAP = 6;

export class PdfExtractError extends Error {}

/**
 * Groups positioned runs into rows of cells.
 *
 * Exported for testing: the grouping is the part that decides whether the
 * numbers come out under the right headings, so it is worth pinning down
 * against known layouts rather than only against whole PDFs.
 */
export function groupRunsIntoRows(runs: Run[]): string[][] {
  if (runs.length === 0) return [];

  // PDF y grows upward, so a descending sort reads top to bottom.
  const byRow = new Map<number, Run[]>();

  for (const run of runs) {
    if (!run.text.trim()) continue;

    // Snap to an existing row when one is within tolerance, so a baseline
    // that wobbles by a fraction of a point does not split a line in two.
    let key = run.y;
    for (const existing of byRow.keys()) {
      if (Math.abs(existing - run.y) <= ROW_TOLERANCE) {
        key = existing;
        break;
      }
    }
    byRow.set(key, [...(byRow.get(key) ?? []), run]);
  }

  return [...byRow.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, rowRuns]) => {
      const ordered = rowRuns.slice().sort((a, b) => a.x - b.x);

      // Merge runs that sit flush against each other — a PDF often splits a
      // single word across several runs for kerning — and split where a real
      // gap says one cell ended and the next began.
      const cells: string[] = [];
      let current = "";
      let previousEnd = Number.NEGATIVE_INFINITY;

      for (const run of ordered) {
        const gap = run.x - previousEnd;
        if (current && gap > COLUMN_GAP) {
          cells.push(current.trim());
          current = run.text;
        } else {
          current = current ? `${current}${gap > 1 ? " " : ""}${run.text}` : run.text;
        }
        previousEnd = run.x + estimateWidth(run.text);
      }

      if (current.trim()) cells.push(current.trim());
      return cells;
    })
    .filter((cells) => cells.length > 0);
}

/**
 * Rough advance width of a string in points.
 *
 * pdf.js reports a width per run, but not per character, and the only thing
 * this is used for is deciding whether the next run starts a new cell. Half
 * the font size per character is close enough for that decision and avoids
 * depending on font metrics we do not have.
 */
function estimateWidth(text: string): number {
  return text.length * 4.5;
}

export type PdfTable = {
  /** Header row followed by data rows. */
  rows: string[][];
  pageCount: number;
  /** Rows dropped above the header, and trailing totals. */
  droppedAbove: number;
  droppedSummary: number;
};

/**
 * Reads the first page-spanning table out of a PDF.
 *
 * Pages are concatenated before the table is found, because a table that runs
 * over a page break is one table, and the repeated header on the second page
 * is dropped by the row filter below.
 */
function standardFontsPath(): string {
  // Resolved from the installed package rather than hardcoded, so it keeps
  // working if the dependency moves.
  const entry = require.resolve("pdfjs-dist/package.json");
  return `${entry.replace(/package\.json$/, "")}standard_fonts/`;
}

export async function extractTableFromPdf(buffer: Buffer): Promise<PdfTable> {
  // The legacy build is the one that runs under Node without a DOM.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Untrusted input, so it is parsed with no ability to fetch anything.
    disableFontFace: true,
    /*
     * Where pdf.js finds metrics for the 14 standard PDF fonts. Without it
     * every parse logs "Ensure that the standardFontDataUrl API parameter is
     * provided" - harmless, but it would appear in the server log on every
     * upload and train whoever reads that log to ignore it.
     */
    standardFontDataUrl: standardFontsPath(),
  });

  const document = await task.promise;
  // Read before teardown; the proxy is not usable afterwards.
  const pageCount = document.numPages;
  const allRows: string[][] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      /*
       * getTextContent() returns TextItem | TextMarkedContent. Only the former
       * carries a string and a position; the latter is structural markup with
       * neither, so it is filtered out rather than cast away.
       */
      const runs: Run[] = content.items.flatMap((item) => {
        if (!("str" in item) || !("transform" in item)) return [];
        return [{ text: item.str, x: item.transform[4], y: item.transform[5] }];
      });

      allRows.push(...groupRunsIntoRows(runs));
      page.cleanup();
    }
  } finally {
    // destroy() belongs to the loading task, not the document proxy - the
    // proxy only offers cleanup(), which frees page resources but leaves the
    // worker running.
    await task.destroy();
  }

  if (allRows.length === 0) {
    throw new PdfExtractError(
      "No text could be read from this PDF. If it is a scan or a photo, the page is an image and there are no characters to extract.",
    );
  }

  /*
   * Only rows that look like part of a table are kept.
   *
   * A brochure or a letter produces one long cell per line. A table produces
   * several. Requiring at least two cells drops prose, page numbers and
   * headers without needing to understand the document.
   */
  const tabular = allRows.filter((row) => row.length >= 2);

  if (tabular.length < 2) {
    throw new PdfExtractError(
      "No table was found in this PDF. It reads as prose rather than rows and columns - if the data exists as a spreadsheet, uploading that will give a far better result.",
    );
  }

  // The same header detection the spreadsheet path uses, so a title block or a
  // trailing TOTAL row is handled identically whatever the file was.
  const shape = extractTable(tabular);

  if (shape.rows.length < 2) {
    throw new PdfExtractError(
      "A table was found but it has no rows of data underneath its headings.",
    );
  }

  return {
    rows: shape.rows,
    pageCount,
    droppedAbove: shape.droppedAbove,
    droppedSummary: shape.droppedSummary,
  };
}

/** Escapes one cell for CSV. */
function escapeCsv(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Renders the extracted table as CSV, which is what the engine reads. */
export function tableToCsv(rows: string[][]): string {
  const width = Math.max(...rows.map((row) => row.length));
  return rows
    .map((row) => {
      const padded = [...row];
      while (padded.length < width) padded.push("");
      return padded.map(escapeCsv).join(",");
    })
    .join("\n");
}
