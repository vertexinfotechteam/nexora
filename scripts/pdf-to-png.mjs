/**
 * Renders each page of a PDF to a PNG so the layout can be inspected visually.
 * Development utility only — not part of the application.
 *
 *   node scripts/pdf-to-png.mjs report.pdf pdfpages 1.5
 */

import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , input = "report.pdf", outDir = "pdfpages", scaleArg = "1.5"] =
  process.argv;

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

// pdf.js resolves these as URLs and requires the trailing slash on Windows.
const distRoot = path.dirname(
  new URL(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")).pathname,
);
const packageRoot = path.resolve(distRoot, "..", "..");

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(input)),
  cMapUrl: `${pathToFileURL(path.join(packageRoot, "cmaps")).href}/`,
  cMapPacked: true,
  standardFontDataUrl: `${pathToFileURL(path.join(packageRoot, "standard_fonts")).href}/`,
  useSystemFonts: true,
}).promise;

mkdirSync(outDir, { recursive: true });
const scale = Number(scaleArg);
const width = String(doc.numPages).length;

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const file = path.join(outDir, `page-${String(i).padStart(width, "0")}.png`);
  writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(`${file}  ${canvas.width}x${canvas.height}`);
}
