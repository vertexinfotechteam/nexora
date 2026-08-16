import "server-only";

import type { Branding } from "@/lib/branding";
import type { ReportPayload } from "@/lib/store/types";

/**
 * Excel export.
 *
 * The same verified payload that produces the PDF, laid out as a workbook so a
 * reader can pivot and re-chart the underlying numbers themselves. Every sheet
 * carries the business branding, and the raw result rows are included so no one
 * has to retype a figure out of a report.
 */

const INK = "FF1B2130";
const MUTED = "FF5B6472";
const ACCENT = "FF0A4A3C";
const LINE = "FFE2E5EA";
const PANEL = "FFF7F8FA";

/** Strips the `data:image/png;base64,` prefix for ExcelJS. */
function splitDataUrl(
  dataUrl: string | null,
): { base64: string; extension: "png" | "jpeg" } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) return null;
  // ExcelJS supports png and jpeg; webp is not accepted, so skip it rather
  // than write a corrupt image into the workbook.
  if (match[1] === "webp") return null;
  return { base64: match[2], extension: match[1] as "png" | "jpeg" };
}

export async function renderReportExcel(
  payload: ReportPayload,
  branding: Branding,
  workspaceName: string,
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = branding.business_name ?? workspaceName;
  workbook.company = "NEXORA AI · Vertex Infotech";
  workbook.created = new Date(payload.generatedAt);

  const businessName = branding.business_name ?? workspaceName;

  /* ------------------------------------------------------------------ */
  /* Summary                                                            */
  /* ------------------------------------------------------------------ */
  const summary = workbook.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  });
  summary.columns = [
    { width: 30 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  const logo = splitDataUrl(branding.logo_data_url);
  if (logo) {
    const imageId = workbook.addImage({
      base64: logo.base64,
      extension: logo.extension,
    });
    // Anchored in the header band, sized to stay inside it.
    summary.addImage(imageId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 132, height: 44 },
    });
    summary.getRow(1).height = 38;
    summary.getRow(2).height = 12;
  }

  let row = logo ? 3 : 1;

  const title = summary.getCell(`A${row}`);
  title.value = businessName;
  title.font = { size: 16, bold: true, color: { argb: INK } };
  row++;

  const reportTitle = summary.getCell(`A${row}`);
  reportTitle.value = payload.title;
  reportTitle.font = { size: 12, bold: true, color: { argb: ACCENT } };
  row += 2;

  const meta: [string, string][] = [
    ["Question", payload.question],
    ["Dataset", payload.datasetName],
    [
      "Data period",
      payload.periodStart && payload.periodEnd
        ? `${payload.periodStart} to ${payload.periodEnd}`
        : "Full dataset",
    ],
    ["Generated", new Date(payload.generatedAt).toUTCString()],
    [
      "Narrative source",
      payload.provider ? `${payload.provider} / ${payload.model}` : "Statistical (no AI provider)",
    ],
  ];
  for (const [label, value] of meta) {
    summary.getCell(`A${row}`).value = label;
    summary.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: MUTED } };
    summary.getCell(`B${row}`).value = value;
    summary.getCell(`B${row}`).font = { size: 10, color: { argb: INK } };
    row++;
  }
  row++;

  summary.getCell(`A${row}`).value = "Executive summary";
  summary.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: INK } };
  row++;
  const summaryCell = summary.getCell(`A${row}`);
  summaryCell.value = payload.executiveSummary;
  summaryCell.alignment = { wrapText: true, vertical: "top" };
  summary.mergeCells(`A${row}:E${row}`);
  summary.getRow(row).height = 58;
  row += 2;

  if (payload.kpis.length > 0) {
    summary.getCell(`A${row}`).value = "Key measures";
    summary.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: INK } };
    row++;

    const header = summary.getRow(row);
    header.values = ["Measure", "Value", "Change vs previous period"];
    header.font = { bold: true, size: 10, color: { argb: INK } };
    header.eachCell((cell, index) => {
      if (index > 3) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
    });
    row++;

    for (const kpi of payload.kpis) {
      summary.getCell(`A${row}`).value = kpi.label;
      summary.getCell(`B${row}`).value = kpi.value;
      summary.getCell(`C${row}`).value = kpi.change ?? "—";
      summary.getRow(row).font = { size: 10 };
      row++;
    }
    row++;
  }

  if (payload.quality) {
    summary.getCell(`A${row}`).value = "Data quality";
    summary.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: INK } };
    row++;
    const q = payload.quality;
    const qualityRows: [string, string | number][] = [
      ["Score (out of 100)", q.score],
      ["Rows", q.rowCount],
      ["Columns", q.columnCount],
      ["Duplicate rows", q.duplicateRows],
      ["Missing cells", `${q.missingCells} of ${q.totalCells}`],
    ];
    for (const [label, value] of qualityRows) {
      summary.getCell(`A${row}`).value = label;
      summary.getCell(`A${row}`).font = { size: 10, color: { argb: MUTED } };
      summary.getCell(`B${row}`).value = value;
      summary.getCell(`B${row}`).font = { size: 10 };
      row++;
    }
    row++;
  }

  /* Signature block ---------------------------------------------------- */
  row += 1;
  const signature = splitDataUrl(branding.signature_data_url);
  if (signature) {
    const imageId = workbook.addImage({
      base64: signature.base64,
      extension: signature.extension,
    });
    summary.addImage(imageId, {
      tl: { col: 0.15, row: row - 0.8 },
      ext: { width: 120, height: 40 },
    });
    row += 2;
  }
  if (branding.signatory_name || signature) {
    summary.getCell(`A${row}`).border = {
      top: { style: "thin", color: { argb: LINE } },
    };
    row++;
    summary.getCell(`A${row}`).value = branding.signatory_name ?? "Authorised signatory";
    summary.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: INK } };
    row++;
    if (branding.signatory_title) {
      summary.getCell(`A${row}`).value = branding.signatory_title;
      summary.getCell(`A${row}`).font = { size: 9, color: { argb: MUTED } };
      row++;
    }
  }

  row++;
  summary.getCell(`A${row}`).value =
    "Every figure in this workbook was computed by the NEXORA AI analytics engine from the source dataset.";
  summary.getCell(`A${row}`).font = { size: 8, italic: true, color: { argb: MUTED } };

  /* ------------------------------------------------------------------ */
  /* Chart data — one sheet per chart, so the numbers are re-usable      */
  /* ------------------------------------------------------------------ */
  payload.charts.slice(0, 8).forEach((chart, index) => {
    const name = safeSheetName(chart.spec.title, `Chart ${index + 1}`);
    const sheet = workbook.addWorksheet(name);
    const keys = [chart.spec.xKey, ...chart.spec.yKeys].filter(Boolean);
    if (keys.length === 0 || chart.rows.length === 0) {
      sheet.getCell("A1").value = "No rows.";
      return;
    }

    sheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.max(14, Math.min(34, key.length + 6)),
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: INK } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PANEL },
    };

    for (const dataRow of chart.rows) {
      sheet.addRow(
        Object.fromEntries(keys.map((key) => [key, dataRow[key] ?? null])),
      );
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: keys.length },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  });

  /* ------------------------------------------------------------------ */
  /* Anomalies                                                          */
  /* ------------------------------------------------------------------ */
  const anomalySheet = workbook.addWorksheet("Anomalies");
  anomalySheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Metric", key: "metric", width: 20 },
    { header: "Actual", key: "actual", width: 16 },
    { header: "Expected", key: "expected", width: 16 },
    { header: "Deviation %", key: "deviation", width: 14 },
    { header: "z-score", key: "z", width: 12 },
    { header: "Direction", key: "direction", width: 12 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Confidence %", key: "confidence", width: 14 },
    { header: "Method", key: "method", width: 52 },
  ];
  styleHeader(anomalySheet);
  if (payload.anomalies.length === 0) {
    anomalySheet.addRow({
      date: "No anomalies were detected in this analysis.",
    });
  } else {
    for (const anomaly of payload.anomalies) {
      anomalySheet.addRow({
        date: anomaly.occurred_on,
        metric: anomaly.metric,
        actual: anomaly.actual_value,
        expected: anomaly.expected_value,
        deviation: anomaly.deviation_pct,
        z: anomaly.z_score,
        direction: anomaly.direction,
        severity: anomaly.severity,
        confidence: anomaly.confidence,
        method: anomaly.method,
      });
    }
    anomalySheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  /* ------------------------------------------------------------------ */
  /* Forecast                                                           */
  /* ------------------------------------------------------------------ */
  const forecastSheet = workbook.addWorksheet("Forecast");
  forecastSheet.columns = [
    { header: "Metric", key: "metric", width: 20 },
    { header: "Period", key: "period", width: 14 },
    { header: "Type", key: "type", width: 12 },
    { header: "Value", key: "value", width: 16 },
    { header: "Low", key: "low", width: 16 },
    { header: "High", key: "high", width: 16 },
    { header: "Model", key: "model", width: 56 },
    { header: "Accuracy", key: "accuracy", width: 26 },
  ];
  styleHeader(forecastSheet);
  if (payload.forecasts.length === 0) {
    forecastSheet.addRow({ metric: "No forecast was produced." });
  } else {
    for (const forecast of payload.forecasts) {
      for (const point of forecast.history) {
        forecastSheet.addRow({
          metric: forecast.metric,
          period: point.period,
          type: "actual",
          value: point.value,
        });
      }
      for (const point of forecast.points) {
        forecastSheet.addRow({
          metric: forecast.metric,
          period: point.period,
          type: "forecast",
          value: point.value,
          low: point.lower,
          high: point.upper,
          model: forecast.model,
          accuracy:
            forecast.mape === null
              ? "not measured"
              : `${forecast.mape}% (${forecast.accuracy_basis})`,
        });
      }
    }
    forecastSheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  /* ------------------------------------------------------------------ */
  /* Recommendations                                                    */
  /* ------------------------------------------------------------------ */
  const recSheet = workbook.addWorksheet("Recommendations");
  recSheet.columns = [
    { header: "Title", key: "title", width: 44 },
    { header: "Impact", key: "impact", width: 12 },
    { header: "Confidence %", key: "confidence", width: 14 },
    { header: "Detail", key: "body", width: 80 },
    { header: "Evidence", key: "evidence", width: 60 },
  ];
  styleHeader(recSheet);
  if (payload.recommendations.length === 0) {
    recSheet.addRow({ title: "No recommendation met the evidence threshold." });
  } else {
    for (const recommendation of payload.recommendations) {
      const added = recSheet.addRow({
        title: recommendation.title,
        impact: recommendation.impact,
        confidence: recommendation.confidence,
        body: recommendation.body,
        evidence: recommendation.evidence
          .map((item) => `${item.label}: ${item.value}`)
          .join(" | "),
      });
      added.alignment = { wrapText: true, vertical: "top" };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Method trail                                                       */
  /* ------------------------------------------------------------------ */
  const methodSheet = workbook.addWorksheet("Method");
  methodSheet.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "Stage", key: "stage", width: 16 },
    { header: "Step", key: "label", width: 48 },
    { header: "Detail", key: "detail", width: 66 },
    { header: "Duration (ms)", key: "duration", width: 14 },
  ];
  styleHeader(methodSheet);
  payload.steps.forEach((step, index) => {
    methodSheet.addRow({
      n: index + 1,
      stage: step.stage,
      label: step.label,
      detail: step.detail ?? "",
      duration: step.durationMs ?? "",
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function styleHeader(sheet: {
  getRow: (n: number) => {
    font: unknown;
    fill: unknown;
    height?: number;
  };
}) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: INK } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
  header.height = 18;
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned.length > 0 ? cleaned : fallback;
}
