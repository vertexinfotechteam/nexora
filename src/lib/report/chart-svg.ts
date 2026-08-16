import { scaleBand, scaleLinear } from "d3-scale";
import { line as d3Line, arc as d3Arc, pie as d3Pie } from "d3-shape";
import { formatNumber } from "@/lib/utils";
import type { ChartSpec } from "@/lib/store/types";

/**
 * Chart geometry for the PDF.
 *
 * @react-pdf/renderer draws vector primitives rather than DOM, so charts are
 * described here as plain path/rect/text geometry and rendered by the PDF
 * component. Producing real vectors (instead of a screenshot) keeps the report
 * crisp at any zoom and keeps the numbers selectable as text.
 */

export type PdfChartGeometry =
  | {
      kind: "xy";
      width: number;
      height: number;
      series: { path: string; color: string; label: string }[];
      bars: { x: number; y: number; width: number; height: number; color: string }[];
      points: { cx: number; cy: number; color: string }[];
      xTicks: { x: number; label: string }[];
      yTicks: { y: number; label: string }[];
      plot: { left: number; top: number; right: number; bottom: number };
    }
  | {
      kind: "pie";
      width: number;
      height: number;
      slices: { path: string; color: string; label: string; value: number; percent: number }[];
    }
  | { kind: "none"; reason: string };

export const PDF_SERIES_COLORS = [
  "#0a4a3c",
  "#b4762a",
  "#0e7490",
  "#6d4d9e",
  "#c0392b",
  "#157347",
  "#8a7320",
  "#6b6459",
];

const WIDTH = 495;
const HEIGHT = 190;
const MARGIN = { top: 12, right: 14, bottom: 26, left: 54 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const multiplier = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const niceStep = multiplier * step;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + niceStep * 0.001; v += niceStep) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

export function buildChartGeometry(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
): PdfChartGeometry {
  if (rows.length === 0) {
    return { kind: "none", reason: "No rows to plot." };
  }

  const plot = {
    left: MARGIN.left,
    top: MARGIN.top,
    right: WIDTH - MARGIN.right,
    bottom: HEIGHT - MARGIN.bottom,
  };
  const innerWidth = plot.right - plot.left;
  const innerHeight = plot.bottom - plot.top;

  /* ---------------------------------------------------------------- donut */
  if (spec.type === "donut") {
    const valueKey = spec.yKeys[0];
    const entries = rows
      .map((row) => ({
        label: String(row[spec.xKey] ?? ""),
        value: Number(row[valueKey]),
      }))
      .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);

    if (entries.length === 0) {
      return { kind: "none", reason: "No positive values to plot." };
    }

    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const radius = HEIGHT / 2 - 12;
    const pieLayout = d3Pie<{ label: string; value: number }>()
      .sort(null)
      .value((d) => d.value);
    const arcGenerator = d3Arc<ReturnType<typeof pieLayout>[number]>()
      .innerRadius(radius * 0.55)
      .outerRadius(radius)
      .padAngle(0.012);

    return {
      kind: "pie",
      width: WIDTH,
      height: HEIGHT,
      slices: pieLayout(entries).map((slice, index) => ({
        path: arcGenerator(slice) ?? "",
        color: PDF_SERIES_COLORS[index % PDF_SERIES_COLORS.length],
        label: slice.data.label,
        value: slice.data.value,
        percent: (slice.data.value / total) * 100,
      })),
    };
  }

  /* ------------------------------------------------------------------ xy */
  const yKeys = spec.yKeys.filter((key) =>
    rows.some((row) => Number.isFinite(Number(row[key]))),
  );
  if (yKeys.length === 0) {
    return { kind: "none", reason: "No numeric column to plot." };
  }

  const allValues = rows.flatMap((row) =>
    yKeys.map((key) => Number(row[key])).filter(Number.isFinite),
  );
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  // Always include zero for bars so lengths are proportional.
  const yMin = spec.type === "bar" ? Math.min(0, rawMin) : rawMin;
  const yMax = rawMax === yMin ? yMin + 1 : rawMax;
  const pad = (yMax - yMin) * 0.08;

  const y = scaleLinear()
    .domain([yMin - (spec.type === "bar" ? 0 : pad), yMax + pad])
    .range([plot.bottom, plot.top]);

  const yTicks = niceTicks(y.domain()[0], y.domain()[1]).map((value) => ({
    y: y(value),
    label: formatNumber(value),
  }));

  const labels = rows.map((row) => String(row[spec.xKey] ?? ""));

  /* bar */
  if (spec.type === "bar" || spec.type === "histogram") {
    const x = scaleBand<string>()
      .domain(labels.map((label, index) => `${index}:${label}`))
      .range([plot.left, plot.right])
      .padding(0.28);

    const bandWidth = x.bandwidth();
    const perSeries = bandWidth / yKeys.length;
    const bars: Extract<PdfChartGeometry, { kind: "xy" }>["bars"] = [];

    rows.forEach((row, rowIndex) => {
      const bandX = x(`${rowIndex}:${labels[rowIndex]}`) ?? plot.left;
      yKeys.forEach((key, seriesIndex) => {
        const value = Number(row[key]);
        if (!Number.isFinite(value)) return;
        const top = y(Math.max(value, 0));
        const base = y(0);
        bars.push({
          x: bandX + seriesIndex * perSeries,
          y: Math.min(top, base),
          width: Math.max(1, perSeries - 1),
          height: Math.max(0.6, Math.abs(base - top)),
          color: PDF_SERIES_COLORS[seriesIndex % PDF_SERIES_COLORS.length],
        });
      });
    });

    // Thin the tick labels so they never overlap.
    const stride = Math.ceil(labels.length / 8);
    const xTicks = labels
      .map((label, index) => ({
        x: (x(`${index}:${label}`) ?? plot.left) + bandWidth / 2,
        label: label.length > 12 ? `${label.slice(0, 11)}…` : label,
        index,
      }))
      .filter((tick) => tick.index % stride === 0)
      .map(({ x: tickX, label }) => ({ x: tickX, label }));

    return {
      kind: "xy",
      width: WIDTH,
      height: HEIGHT,
      series: [],
      bars,
      points: [],
      xTicks,
      yTicks,
      plot,
    };
  }

  /* scatter */
  if (spec.type === "scatter") {
    const xValues = rows.map((row) => Number(row[spec.xKey])).filter(Number.isFinite);
    const x = scaleLinear()
      .domain([Math.min(...xValues), Math.max(...xValues)])
      .range([plot.left, plot.right]);

    const points = rows
      .map((row) => ({
        cx: x(Number(row[spec.xKey])),
        cy: y(Number(row[yKeys[0]])),
        color: PDF_SERIES_COLORS[1],
      }))
      .filter((point) => Number.isFinite(point.cx) && Number.isFinite(point.cy));

    return {
      kind: "xy",
      width: WIDTH,
      height: HEIGHT,
      series: [],
      bars: [],
      points,
      xTicks: niceTicks(x.domain()[0], x.domain()[1], 5).map((value) => ({
        x: x(value),
        label: formatNumber(value),
      })),
      yTicks,
      plot,
    };
  }

  /* line (default) */
  const x = scaleLinear()
    .domain([0, Math.max(1, rows.length - 1)])
    .range([plot.left, plot.right]);

  const series = yKeys.map((key, index) => {
    const generator = d3Line<{ i: number; v: number }>()
      .defined((d) => Number.isFinite(d.v))
      .x((d) => x(d.i))
      .y((d) => y(d.v));

    const path =
      generator(
        rows.map((row, i) => ({ i, v: Number(row[key]) })),
      ) ?? "";

    return {
      path,
      color: PDF_SERIES_COLORS[index % PDF_SERIES_COLORS.length],
      label: key,
    };
  });

  const stride = Math.ceil(rows.length / 7);
  const xTicks = labels
    .map((label, index) => ({ x: x(index), label, index }))
    .filter((tick) => tick.index % stride === 0)
    .map(({ x: tickX, label }) => ({
      x: tickX,
      label: label.length > 12 ? label.slice(0, 11) : label,
    }));

  return {
    kind: "xy",
    width: WIDTH,
    height: HEIGHT,
    series,
    bars: [],
    points: [],
    xTicks,
    yTicks,
    plot,
  };
}
