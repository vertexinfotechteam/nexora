import "server-only";

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_LIMITS } from "@/lib/env";
import { quoteLiteral } from "@/lib/duckdb/engine";

/**
 * Turns an uploaded file into something DuckDB can read.
 *
 * CSV / TSV / JSON / Parquet are read natively. XLSX has no native reader
 * without downloading the `excel` extension (which the sealed engine forbids),
 * so it is converted to CSV once at ingest time and the CSV becomes the source.
 */

export type FileKind = "csv" | "tsv" | "json" | "parquet" | "xlsx";

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
    throw new IngestError(
      `The file is larger than the ${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)} MB upload limit.`,
      "Split the file, or filter it down before uploading.",
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

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let text: string;
    if (value instanceof Date) text = value.toISOString();
    else if (typeof value === "object") {
      const cell = value as { text?: string; result?: unknown; richText?: { text: string }[] };
      if (Array.isArray(cell.richText)) text = cell.richText.map((r) => r.text).join("");
      else if (cell.text !== undefined) text = cell.text;
      else if (cell.result !== undefined) text = String(cell.result);
      else text = "";
    } else text = String(value);

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // ExcelJS row.values is 1-indexed with a leading hole.
    lines.push(values.slice(1).map(escape).join(","));
  });

  if (lines.length === 0) {
    throw new IngestError("The first worksheet is empty.");
  }

  const csvPath = `${absolutePath}.converted.csv`;
  await writeFile(csvPath, lines.join("\n"), "utf8");
  return csvPath;
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
  }
}
