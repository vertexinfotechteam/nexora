"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ChartSpec } from "@/lib/store/types";

/**
 * Renders a computed result according to the ChartSpec chosen by the engine.
 * The component never decides what to plot — it only draws what was computed.
 */

/* Categorical palette. Resolved from CSS variables so the same series index
   keeps its identity in both themes while staying legible on either
   background. Ordering is amber, blue, teal, violet, rose, green. */
const SERIES_COLORS = [
  "var(--nx-series-1)",
  "var(--nx-series-2)",
  "var(--nx-series-3)",
  "var(--nx-series-4)",
  "var(--nx-series-5)",
  "var(--nx-series-6)",
  "var(--nx-series-7)",
  "var(--nx-series-8)",
];

const AXIS = {
  stroke: "var(--nx-border-strong)",
  tick: { fill: "var(--nx-text-dim)", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "var(--nx-border)" },
};

function formatValue(value: unknown, format: ChartSpec["valueFormat"]): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "—");
  if (format === "currency") return formatCurrency(numeric);
  if (format === "percent") return `${numeric.toFixed(1)}%`;
  return formatNumber(numeric);
}

function shortLabel(value: unknown): string {
  const text = String(value ?? "");
  return text.length > 14 ? `${text.slice(0, 13)}…` : text;
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: unknown; color?: string }[];
  label?: unknown;
  valueFormat: ChartSpec["valueFormat"];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 py-1.5 shadow-xl">
      <p className="mb-1 text-[10.5px] font-medium text-[var(--nx-text-muted)]">
        {String(label ?? "")}
      </p>
      {payload.map((entry, index) => (
        <p
          key={index}
          className="flex items-center gap-1.5 text-[11.5px] text-[var(--nx-text)]"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-[var(--nx-text-muted)]">{entry.name}</span>
          <span className="ml-auto font-mono">
            {formatValue(entry.value, valueFormat)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Bins a numeric column into a histogram using the Freedman–Diaconis rule. */
function buildHistogram(
  rows: Record<string, unknown>[],
  key: string,
): { bucket: string; count: number }[] {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length < 2) return [];

  const q = (p: number) => {
    const pos = (values.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return values[base + 1] !== undefined
      ? values[base] + rest * (values[base + 1] - values[base])
      : values[base];
  };

  const iqr = q(0.75) - q(0.25);
  const width =
    iqr > 0
      ? (2 * iqr) / Math.cbrt(values.length)
      : (values[values.length - 1] - values[0]) / 10 || 1;
  const min = values[0];
  const max = values[values.length - 1];
  const binCount = Math.max(1, Math.min(30, Math.ceil((max - min) / width) || 1));
  const binSize = (max - min) / binCount || 1;

  const bins = Array.from({ length: binCount }, (_, i) => ({
    bucket: `${formatNumber(min + i * binSize)}`,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / binSize));
    bins[index].count++;
  }
  return bins;
}

export function ChartView({
  spec,
  rows,
  height = 240,
}: {
  spec: ChartSpec;
  rows: Record<string, unknown>[];
  height?: number;
}) {
  const histogram = useMemo(
    () => (spec.type === "histogram" ? buildHistogram(rows, spec.xKey) : []),
    [spec.type, spec.xKey, rows],
  );

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[12px] text-[var(--nx-text-muted)]">
        No rows to plot.
      </p>
    );
  }

  const tooltip = (
    <Tooltip
      cursor={{ fill: "var(--nx-cursor)", stroke: "var(--nx-border-strong)" }}
      content={<ChartTooltip valueFormat={spec.valueFormat} />}
    />
  );

  if (spec.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--nx-grid)" vertical={false} />
          <XAxis dataKey={spec.xKey} {...AXIS} tickFormatter={shortLabel} minTickGap={20} />
          <YAxis
            {...AXIS}
            width={52}
            tickFormatter={(v) => formatValue(v, spec.valueFormat)}
          />
          {tooltip}
          {spec.yKeys.length > 1 ? (
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--nx-text-dim)" }} />
          ) : null}
          {spec.yKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={1.8}
              dot={rows.length <= 40 ? { r: 2, strokeWidth: 0 } : false}
              activeDot={{ r: 3.5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke="var(--nx-grid)" horizontal={false} />
          <XAxis
            type="number"
            {...AXIS}
            tickFormatter={(v) => formatValue(v, spec.valueFormat)}
          />
          <YAxis
            type="category"
            dataKey={spec.xKey}
            {...AXIS}
            width={96}
            tickFormatter={shortLabel}
          />
          {tooltip}
          {spec.yKeys.length > 1 ? (
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--nx-text-dim)" }} />
          ) : null}
          {spec.yKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={SERIES_COLORS[index % SERIES_COLORS.length]}
              radius={[0, 2, 2, 0]}
              barSize={12}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "donut") {
    const key = spec.yKeys[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={rows}
            dataKey={key}
            nameKey={spec.xKey}
            innerRadius="52%"
            outerRadius="78%"
            paddingAngle={2}
            stroke="none"
          >
            {rows.map((_, index) => (
              <Cell key={index} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
            ))}
          </Pie>
          {tooltip}
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--nx-text-dim)" }}
            formatter={(value) => shortLabel(value)}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--nx-grid)" />
          <XAxis
            type="number"
            dataKey={spec.xKey}
            name={spec.xLabel}
            {...AXIS}
            tickFormatter={(v) => formatNumber(Number(v))}
          />
          <YAxis
            type="number"
            dataKey={spec.yKeys[0]}
            name={spec.yLabel}
            {...AXIS}
            width={52}
            tickFormatter={(v) => formatValue(v, spec.valueFormat)}
          />
          {tooltip}
          <Scatter data={rows} fill={SERIES_COLORS[1]} fillOpacity={0.65} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "histogram") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={histogram} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--nx-grid)" vertical={false} />
          <XAxis dataKey="bucket" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={40} />
          <Tooltip
            cursor={{ fill: "var(--nx-cursor)" }}
            content={<ChartTooltip valueFormat="number" />}
          />
          <Bar dataKey="count" fill={SERIES_COLORS[0]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "heatmap") {
    return <HeatmapView spec={spec} rows={rows} />;
  }

  return <ResultTable columns={Object.keys(rows[0] ?? {})} rows={rows} />;
}

function HeatmapView({
  spec,
  rows,
}: {
  spec: ChartSpec;
  rows: Record<string, unknown>[];
}) {
  const valueKey = spec.yKeys[0];
  const xValues = [...new Set(rows.map((r) => String(r[spec.xKey])))];
  const yValues = [...new Set(rows.map((r) => String(r[spec.seriesKey ?? ""])))];
  const lookup = new Map(
    rows.map((r) => [
      `${String(r[spec.xKey])}|${String(r[spec.seriesKey ?? ""])}`,
      Number(r[valueKey]),
    ]),
  );
  const values = [...lookup.values()].filter(Number.isFinite);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);

  return (
    <div className="overflow-x-auto px-3 py-2">
      <table className="border-separate border-spacing-[2px] text-[10.5px]">
        <thead>
          <tr>
            <th />
            {xValues.map((x) => (
              <th key={x} className="px-1 pb-1 font-medium text-[var(--nx-text-dim)]">
                {shortLabel(x)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yValues.map((y) => (
            <tr key={y}>
              <th className="pr-2 text-right font-medium text-[var(--nx-text-dim)]">
                {shortLabel(y)}
              </th>
              {xValues.map((x) => {
                const value = lookup.get(`${x}|${y}`);
                const intensity =
                  value === undefined || max === min
                    ? 0
                    : (value - min) / (max - min);
                return (
                  <td
                    key={x}
                    title={`${y} · ${x}: ${formatValue(value, spec.valueFormat)}`}
                    className="h-6 w-11 rounded text-center font-mono text-[9.5px]"
                    style={{
                      // Ramp built from theme tokens so the heatmap keeps its
                      // contrast in both light and dark.
                      background:
                        value === undefined
                          ? "var(--nx-heat-base)"
                          : `rgba(var(--nx-heat-rgb), ${(0.12 + intensity * 0.88).toFixed(3)})`,
                      color:
                        intensity > 0.45
                          ? "var(--nx-heat-text-high)"
                          : "var(--nx-heat-text-low)",
                    }}
                  >
                    {value === undefined ? "" : formatNumber(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultTable({
  columns,
  rows,
  maxRows = 100,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  maxRows?: number;
}) {
  const shown = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11.5px]">
        <thead className="sticky top-0 bg-[var(--nx-inset)]">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap border-b border-[var(--nx-border)] px-2.5 py-1.5 text-left font-semibold text-[var(--nx-text-muted)]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index} className="hover:bg-[var(--nx-hover)]">
              {columns.map((column) => {
                const value = row[column];
                const numeric = typeof value === "number";
                return (
                  <td
                    key={column}
                    className={`whitespace-nowrap border-b border-[var(--nx-border-subtle)] px-2.5 py-1 ${
                      numeric ? "text-right font-mono" : ""
                    } ${value === null || value === undefined ? "text-[var(--nx-text-faint)]" : "text-[var(--nx-text)]"}`}
                  >
                    {value === null || value === undefined
                      ? "NULL"
                      : numeric
                        ? formatNumber(value)
                        : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows ? (
        <p className="border-t border-[var(--nx-border)] px-2.5 py-1.5 text-[11px] text-[var(--nx-text-muted)]">
          Showing {maxRows.toLocaleString()} of {rows.length.toLocaleString()} rows.
        </p>
      ) : null}
    </div>
  );
}
