import "server-only";

import { writeFile } from "node:fs/promises";
import { assessTable, extractTable } from "./header";
import path from "node:path";
import { UPLOAD_LIMITS } from "@/lib/env";
import { quoteLiteral } from "@/lib/duckdb/constants";

/**
 * Turns an uploaded file into something DuckDB can read.
 *
 * CSV / TSV / JSON / Parquet are read natively. XLSX has no native reader
 * without downloading the `excel` extension (which the sealed engine forbids),
 * so it is converted to CSV once at ingest time and the CSV becomes the source.
 */

export type FileKind = "csv" | "tsv" | "json" | "parquet" | "xlsx" | "pdf";

export class IngestError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export function detectFileKind(fileName: string): FileKind {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  switch (ext) {
    case "csv":
      return "csv";
    case "tsv":
    case "tab":
      return "tsv";
    case "json":
    case "ndjson":
    case "jsonl":
      return "json";
    case "parquet":
      return "parquet";
    case "xlsx":
      return "xlsx";
    case "pdf":
      return "pdf";
    case "xls":
      throw new IngestError(
        "Legacy .xls files are not supported.",
        "Open the file in Excel and save it as .xlsx, then upload again.",
      );
    default:
      throw new IngestError(
        `".${ext}" files are not supported.`,
        `Supported formats: ${UPLOAD_LIMITS.allowedExtensions.join(", ")}.`,
      );
  }
}

export function validateUpload(fileName: string, sizeBytes: number): FileKind {
  if (sizeBytes <= 0) {
    throw new IngestError("The uploaded file is empty.");
  }
  if (sizeBytes > UPLOAD_LIMITS.maxBytes) {
    // One decimal place: the hosted ceiling is 4.5 MB, and rounding it to
    // "4 MB" would send someone away to trim a file that already fits.
    const limitMb = (UPLOAD_LIMITS.maxBytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "");
    const fileMb = (sizeBytes / 1024 / 1024).toFixed(1);

    throw new IngestError(
      `This file is ${fileMb} MB, and the limit is ${limitMb} MB.`,
      "Filter it down, split it, or remove columns you do not need for this analysis.",
    );
  }
  return detectFileKind(fileName);
}

/**
 * Rejects files whose bytes contradict their extension. A cheap but effective
 * check against a disguised binary being fed to the parser.
 */
export function checkFileSignature(buffer: Buffer, kind: FileKind): void {
  const head = buffer.subarray(0, 8);

  if (kind === "parquet") {
    if (head.subarray(0, 4).toString("latin1") !== "PAR1") {
      throw new IngestError("This file is not a valid Parquet file.");
    }
    return;
  }
  if (kind === "pdf") {
    if (head.subarray(0, 4).toString("latin1") !== "%PDF") {
      throw new IngestError("This file is not a valid PDF.");
    }
    return;
  }
  if (kind === "xlsx") {
    // XLSX is a ZIP container.
    if (!(head[0] === 0x50 && head[1] === 0x4b)) {
      throw new IngestError("This file is not a valid XLSX workbook.");
    }
    return;
  }

  // Text formats: reject anything containing NUL bytes in the first 8 KB,
  // which indicates a binary payload wearing a .csv extension.
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) {
    throw new IngestError(
      "This file looks like a binary file, not text.",
      "Check that the file really is a CSV/TSV/JSON export.",
    );
  }
}

/**
 * Converts an XLSX workbook's first worksheet to CSV, returning the new path.
 * Streaming reader keeps memory flat on large workbooks.
 */
async function convertXlsxToCsv(absolutePath: string): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new IngestError("The workbook has no worksheets.");
  }

  /** A cell's plain text. Formulas contribute their computed result. */
  const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      const cell = value as {
        text?: string;
        result?: unknown;
        richText?: { text: string }[];
      };
      if (Array.isArray(cell.richText)) return cell.richText.map((r) => r.text).join("");
      if (cell.result !== undefined) return String(cell.result);
      if (cell.text !== undefined) return cell.text;
      return "";
    }
    return String(value);
  };

  const escapeCsv = (text: string): string =>
    /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

  /*
   * Read the cells first, then find the table inside the sheet.
   *
   * Writing every row straight out leaves DuckDB to treat line 1 as the
   * header, and business workbooks almost never start with one — a company
   * name, a "Financial Year 2025-26" subtitle and a blank line come first.
   * The result was every column being named after the report title and every
   * number arriving as text, which is indistinguishable downstream from a
   * dataset with no measures in it: no KPIs, no charts, no forecast, and a
   * report with nothing in it.
   */
  const rawRows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // ExcelJS row.values is 1-indexed with a leading hole.
    rawRows.push(values.slice(1).map(cellText));
  });

  if (rawRows.length === 0) {
    throw new IngestError("The first worksheet is empty.");
  }

  const shape = extractTable(rawRows);

  if (shape.rows.length === 0) {
    throw new IngestError("The first worksheet is empty.");
  }
  if (shape.rows.length === 1) {
    throw new IngestError(
      "The worksheet has column headings but no rows of data underneath them.",
    );
  }

  /*
   * Refused here rather than loaded and analysed.
   *
   * A sheet of notes will pass everything above it: a header gets chosen, rows
   * get counted, the profile computes and a quality score comes out. What the
   * person then sees is an analysis of NULLs under columns called column0 and
   * column2 — an answer that looks broken with nothing saying their file was
   * the problem. This is also before the credit is charged.
   */
  const assessment = assessTable(shape.rows);
  if (!assessment.usable) {
    throw new IngestError(
      `No table of data was found in this worksheet. ${assessment.reason}`,
      "If the data is on another sheet or below some notes, move it to its own sheet with one row of column headings at the top, and upload that.",
    );
  }

  const lines = shape.rows.map((row) => row.map(escapeCsv).join(","));

  const csvPath = `${absolutePath}.converted.csv`;
  await writeFile(csvPath, lines.join("\n"), "utf8");
  return csvPath;
}

/**
 * Reconstructs a table from a PDF and writes it as CSV.
 *
 * A PDF carries no table structure - the rows and columns a reader sees are an
 * artefact of where each text run was placed on the page - so this is a
 * reconstruction, not a read. It is offered because business data often only
 * exists as a PDF report, and refusing the file helps nobody; but a
 * spreadsheet of the same data will always be read more faithfully.
 */
async function convertPdfToCsv(absolutePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { extractTableFromPdf, tableToCsv, PdfExtractError } = await import("./pdf");

  try {
    const table = await extractTableFromPdf(await readFile(absolutePath));
    const csvPath = `${absolutePath}.converted.csv`;
    await writeFile(csvPath, tableToCsv(table.rows), "utf8");
    return csvPath;
  } catch (error) {
    if (error instanceof PdfExtractError) {
      throw new IngestError(error.message, "A CSV or Excel export of the same data will read exactly.");
    }
    throw error;
  }
}

/**
 * Builds the SQL source expression the engine uses to materialize the dataset.
 * The path is always a server-resolved absolute path — never AI-influenced.
 */
export async function buildSourceExpression(
  absolutePath: string,
  kind: FileKind,
): Promise<string> {
  switch (kind) {
    case "csv":
      return `read_csv(${quoteLiteral(absolutePath)}, auto_detect=true, sample_size=-1, ignore_errors=true, null_padding=true)`;
    case "tsv":
      return `read_csv(${quoteLiteral(absolutePath)}, delim='\\t', auto_detect=true, sample_size=-1, ignore_errors=true, null_padding=true)`;
    case "json":
      return `read_json_auto(${quoteLiteral(absolutePath)}, sample_size=-1, ignore_errors=true)`;
    case "parquet":
      return `read_parquet(${quoteLiteral(absolutePath)})`;
    case "xlsx": {
      const csvPath = await convertXlsxToCsv(absolutePath);
      return `read_csv(${quoteLiteral(csvPath)}, auto_detect=true, sample_size=-1, ignore_errors=true, null_padding=true)`;
    }
    case "pdf": {
      const csvPath = await convertPdfToCsv(absolutePath);
      return `read_csv(${quoteLiteral(csvPath)}, auto_detect=true, sample_size=-1, ignore_errors=true, null_padding=true)`;
    }
  }
}
