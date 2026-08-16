import "server-only";

import { computeDocumentTotals } from "./totals";
import { fromMinor, getCurrency } from "@/lib/structure/money";
import { DOCUMENT_KIND_LABELS, type BusinessDocument } from "./types";
import type { Branding } from "@/lib/branding";

/**
 * Business document as an Excel workbook.
 *
 * Amounts are written as real numbers with a currency number format, not as
 * pre-formatted strings — so the recipient can sum, filter and pivot them.
 * The values come from the same computeDocumentTotals as the PDF.
 */

const INK = "FF0F172A";
const MUTED = "FF64748B";
const ACCENT = "FF0A4A3C";
const LINE = "FFE2E8F0";
const PANEL = "FFF8FAFC";

function numberFormat(currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  const decimals = currency.decimals > 0 ? `.${"0".repeat(currency.decimals)}` : "";
  // Escape the symbol so Excel treats it as a literal.
  return `"${currency.symbol}"#,##0${decimals}`;
}

function splitDataUrl(dataUrl: string | null) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match || match[1] === "webp") return null;
  return { base64: match[2], extension: match[1] as "png" | "jpeg" };
}

export async function renderDocumentExcel(
  doc: BusinessDocument,
  branding: Branding,
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  const businessName = branding.business_name || doc.from.name || "Business";
  const kindLabel = DOCUMENT_KIND_LABELS[doc.kind];
  const totals = computeDocumentTotals(doc);
  const format = numberFormat(doc.currency);
  const currency = getCurrency(doc.currency);
  const major = (minor: number) => fromMinor(minor, currency);

  workbook.creator = businessName;
  workbook.company = "NEXORA AI · Vertex Infotech";

  /* ------------------------------------------------------------------ */
  /* Document sheet                                                     */
  /* ------------------------------------------------------------------ */
  const sheet = workbook.addWorksheet(kindLabel, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
  });

  sheet.columns = [
    { width: 5 },
    { width: 46 },
    { width: 10 },
    { width: 16 },
    { width: 10 },
    { width: 18 },
  ];

  const logo = splitDataUrl(branding.logo_data_url);
  let row = 1;

  if (logo) {
    const imageId = workbook.addImage({
      base64: logo.base64,
      extension: logo.extension,
    });
    sheet.addImage(imageId, {
      tl: { col: 0.2, row: 0.2 },
      ext: { width: 150, height: 48 },
    });
    sheet.getRow(1).height = 42;
    row = 3;
  }

  sheet.getCell(`A${row}`).value = businessName;
  sheet.getCell(`A${row}`).font = { size: 15, bold: true, color: { argb: INK } };
  sheet.getCell(`F${row}`).value = kindLabel.toUpperCase();
  sheet.getCell(`F${row}`).font = { size: 16, bold: true, color: { argb: ACCENT } };
  sheet.getCell(`F${row}`).alignment = { horizontal: "right" };
  row++;

  for (const line of [doc.from.address, doc.from.phone, doc.from.email, doc.from.taxId]) {
    if (!line?.trim()) continue;
    sheet.getCell(`A${row}`).value = line;
    sheet.getCell(`A${row}`).font = { size: 9, color: { argb: MUTED } };
    row++;
  }

  const metaStart = logo ? 4 : 2;
  const meta: [string, string][] = [
    ["Reference", doc.reference],
    ["Date", doc.issueDate],
    ["Currency", currency.code],
  ];
  if (doc.payment.dueDate) meta.push(["Due date", doc.payment.dueDate]);
  meta.forEach(([label, value], index) => {
    const target = metaStart + index;
    sheet.getCell(`E${target}`).value = label;
    sheet.getCell(`E${target}`).font = { size: 9, color: { argb: MUTED } };
    sheet.getCell(`E${target}`).alignment = { horizontal: "right" };
    sheet.getCell(`F${target}`).value = value;
    sheet.getCell(`F${target}`).font = { size: 9, bold: true, color: { argb: INK } };
    sheet.getCell(`F${target}`).alignment = { horizontal: "right" };
  });

  row = Math.max(row, metaStart + meta.length) + 1;

  // Bill to
  sheet.getCell(`A${row}`).value = "BILL TO";
  sheet.getCell(`A${row}`).font = { size: 8, bold: true, color: { argb: MUTED } };
  row++;
  sheet.getCell(`A${row}`).value = doc.to.name || "-";
  sheet.getCell(`A${row}`).font = { size: 11, bold: true, color: { argb: INK } };
  row++;
  for (const line of [doc.to.address, doc.to.phone, doc.to.email, doc.to.taxId]) {
    if (!line?.trim()) continue;
    sheet.getCell(`A${row}`).value = line;
    sheet.getCell(`A${row}`).font = { size: 9, color: { argb: MUTED } };
    row++;
  }
  row++;

  if (doc.title) {
    sheet.getCell(`A${row}`).value = doc.title;
    sheet.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: INK } };
    row += 2;
  }

  // Items header
  const headerRow = sheet.getRow(row);
  headerRow.values = ["#", "Description", "Qty", "Rate", "Tax %", "Amount"];
  headerRow.eachCell((cell, index) => {
    if (index > 6) return;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    cell.alignment = { horizontal: index >= 3 ? "right" : "left" };
  });
  const itemsStart = row + 1;
  row++;

  doc.items.forEach((item, index) => {
    const lineTotals = totals.lines[index];
    const current = sheet.getRow(row);
    current.values = [
      index + 1,
      item.description,
      item.unit ? `${item.quantity} ${item.unit}` : item.quantity,
      major(item.unitPriceMinor),
      lineTotals.effectiveTaxPct,
      major(lineTotals.netMinor),
    ];
    current.getCell(4).numFmt = format;
    current.getCell(6).numFmt = format;
    current.getCell(5).numFmt = '0"%"';
    current.eachCell((cell, columnIndex) => {
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      if (columnIndex >= 3) cell.alignment = { horizontal: "right" };
    });
    current.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row++;
  });

  if (doc.items.length === 0) {
    sheet.getCell(`B${row}`).value = "No line items.";
    row++;
  }
  const itemsEnd = row - 1;
  row++;

  // Totals. Formulas where possible, so the recipient sees the arithmetic.
  const addTotal = (label: string, value: number, options: { bold?: boolean; formula?: string } = {}) => {
    sheet.getCell(`E${row}`).value = label;
    sheet.getCell(`E${row}`).font = {
      size: options.bold ? 12 : 10,
      bold: options.bold,
      color: { argb: options.bold ? INK : MUTED },
    };
    sheet.getCell(`E${row}`).alignment = { horizontal: "right" };

    const cell = sheet.getCell(`F${row}`);
    cell.value = options.formula ? { formula: options.formula, result: value } : value;
    cell.numFmt = format;
    cell.font = {
      size: options.bold ? 13 : 10,
      bold: options.bold,
      color: { argb: options.bold ? ACCENT : INK },
    };
    cell.alignment = { horizontal: "right" };
    if (options.bold) {
      cell.border = { top: { style: "medium", color: { argb: INK } } };
      sheet.getCell(`E${row}`).border = { top: { style: "medium", color: { argb: INK } } };
    }
    row++;
  };

  addTotal("Subtotal", major(totals.subtotalMinor), {
    formula: doc.items.length > 0 ? `SUM(F${itemsStart}:F${itemsEnd})` : undefined,
  });
  if (totals.totalDiscountMinor > 0) {
    addTotal("Discount", -major(totals.totalDiscountMinor));
  }
  for (const band of totals.taxBreakdown) {
    addTotal(`${doc.taxLabel || "Tax"} @ ${band.pct}%`, major(band.taxMinor));
  }
  if (totals.shippingMinor !== 0) {
    addTotal("Shipping", major(totals.shippingMinor));
  }
  addTotal("Total due", major(totals.grandTotalMinor), { bold: true });
  row++;

  const block = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    sheet.getCell(`A${row}`).value = title;
    sheet.getCell(`A${row}`).font = { size: 10, bold: true, color: { argb: INK } };
    row++;
    for (const line of lines) {
      sheet.getCell(`A${row}`).value = line;
      sheet.getCell(`A${row}`).font = { size: 9, color: { argb: MUTED } };
      sheet.getCell(`A${row}`).alignment = { wrapText: true, vertical: "top" };
      sheet.mergeCells(`A${row}:F${row}`);
      row++;
    }
    row++;
  };

  block(
    "Payment details",
    [
      doc.payment.terms && `Terms: ${doc.payment.terms}`,
      doc.payment.method && `Method: ${doc.payment.method}`,
      doc.payment.bankName && `Bank: ${doc.payment.bankName}`,
      doc.payment.accountName && `Account name: ${doc.payment.accountName}`,
      doc.payment.accountNumber && `Account number: ${doc.payment.accountNumber}`,
      doc.payment.ifscSwift && `IFSC / SWIFT: ${doc.payment.ifscSwift}`,
      doc.payment.upiId && `UPI: ${doc.payment.upiId}`,
      doc.payment.instructions,
    ].filter((line): line is string => Boolean(line && line.trim())),
  );

  block("Notes", doc.notes ? doc.notes.split(/\r?\n/).filter(Boolean) : []);
  block(
    "Terms and conditions",
    doc.termsAndConditions
      ? doc.termsAndConditions.split(/\r?\n/).filter((line) => line.trim())
      : [],
  );

  const signature = splitDataUrl(branding.signature_data_url);
  if (doc.showSignature && (signature || branding.signatory_name)) {
    if (signature) {
      const imageId = workbook.addImage({
        base64: signature.base64,
        extension: signature.extension,
      });
      sheet.addImage(imageId, {
        tl: { col: 4.1, row: row - 0.6 },
        ext: { width: 130, height: 42 },
      });
      row += 3;
    }
    sheet.getCell(`E${row}`).value = branding.signatory_name || "Authorised signatory";
    sheet.getCell(`E${row}`).font = { size: 10, bold: true, color: { argb: INK } };
    row++;
    if (branding.signatory_title) {
      sheet.getCell(`E${row}`).value = branding.signatory_title;
      sheet.getCell(`E${row}`).font = { size: 9, color: { argb: MUTED } };
      row++;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Line items sheet — clean tabular copy for pivoting                 */
  /* ------------------------------------------------------------------ */
  const data = workbook.addWorksheet("Line items");
  data.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "Description", key: "description", width: 48 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Quantity", key: "quantity", width: 11 },
    { header: "Unit price", key: "rate", width: 15 },
    { header: "Gross", key: "gross", width: 15 },
    { header: "Discount %", key: "discountPct", width: 12 },
    { header: "Discount", key: "discount", width: 14 },
    { header: "Net", key: "net", width: 15 },
    { header: "Tax %", key: "taxPct", width: 9 },
    { header: "Tax", key: "tax", width: 14 },
    { header: "Line total", key: "total", width: 16 },
  ];
  data.getRow(1).font = { bold: true, color: { argb: INK } };
  data.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
  data.views = [{ state: "frozen", ySplit: 1 }];

  doc.items.forEach((item, index) => {
    const lineTotals = totals.lines[index];
    const added = data.addRow({
      n: index + 1,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      rate: major(item.unitPriceMinor),
      gross: major(lineTotals.grossMinor),
      discountPct: item.discountPct,
      discount: major(lineTotals.discountMinor),
      net: major(lineTotals.netMinor),
      taxPct: lineTotals.effectiveTaxPct,
      tax: major(lineTotals.taxMinor),
      total: major(lineTotals.totalMinor),
    });
    for (const column of [5, 6, 8, 9, 11, 12]) {
      added.getCell(column).numFmt = format;
    }
  });

  if (doc.items.length > 0) {
    data.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
