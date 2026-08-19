import { AlertTriangle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import { RemoveTile } from "./remove-tile";
import type { DashboardWidget } from "@/lib/store/types";

/**
 * One tile on a saved view.
 *
 * The rows arrive already computed by the engine; this only draws them. Charts
 * are plain SVG with a viewBox rather than a charting library — a tile is small
 * and there may be a dozen on a screen, and the library route on this product
 * has already shipped one chart that measured its container as zero pixels wide
 * and clipped every bar away.
 */

type Row = { label: string; value: number; rowCount: number };

type Result =
  | { ok: true; rows: Row[]; valueLabel: string; groupColumn: string; explanation: string | null; sql: string; truncated: boolean }
  | { ok: false; error: string };

/** Chosen so adjacent slices stay distinguishable without a legend. */
const SLICE_COLOURS = [
  "var(--nx-accent)",
  "var(--nx-purple)",
  "#2b9485",
  "#d6a84f",
  "#5b8fa8",
  "#8a6fa8",
];

export function Tile({
  widget,
  result,
  dashboardId,
}: {
  widget: DashboardWidget;
  result: Result;
  dashboardId: string;
}) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-semibold">{widget.title}</h3>
            {result.ok ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--nx-text-muted)]">
                {result.valueLabel} by {result.groupColumn}
              </p>
            ) : null}
          </div>
          <RemoveTile dashboardId={dashboardId} widgetId={widget.id} title={widget.title ?? "tile"} />
        </div>

        {!result.ok ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--nx-border)] bg-[var(--nx-elevated)] p-2.5">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-warning)]" />
            <p className="text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
              {/* One tile failing must not empty the whole view, so it states
                  its own problem and the others carry on. */}
              {result.error}
            </p>
          </div>
        ) : result.rows.length === 0 ? (
          <p className="mt-3 text-[11.5px] text-[var(--nx-text-muted)]">
            Nothing to show — this grouping returned no rows.
          </p>
        ) : (
          <Body widget={widget} rows={result.rows} />
        )}
      </CardBody>
    </Card>
  );
}

function Body({ widget, rows }: { widget: DashboardWidget; rows: Row[] }) {
  if (widget.widget_type === "kpi") {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return (
      <div className="mt-3">
        <p className="text-[24px] font-semibold leading-none tabular-nums">
          {formatNumber(total)}
        </p>
        <p className="mt-1.5 text-[11px] text-[var(--nx-text-muted)]">
          across {rows.length} {rows.length === 1 ? "group" : "groups"}
        </p>
      </div>
    );
  }

  if (widget.widget_type === "table") {
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[var(--nx-border)] last:border-0">
                <td className="py-1.5 pr-2">{row.label}</td>
                <td className="py-1.5 text-right tabular-nums">{formatNumber(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.widget_type === "donut") return <Donut rows={rows} />;
  if (widget.widget_type === "line") return <LineChart rows={rows} />;
  return <BarChart rows={rows} />;
}

function BarChart({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <div className="mt-3 space-y-1.5">
      {rows.slice(0, 8).map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-[var(--nx-text-muted)]">{row.label}</span>
            <span className="shrink-0 tabular-nums">{formatNumber(row.value)}</span>
          </div>
          {/* A bar rather than an SVG: one div scales to any width without
              needing to know its own pixel size. */}
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--nx-elevated)]">
            <div
              className="h-full rounded-full bg-[var(--nx-accent)]"
              style={{ width: `${Math.max(2, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ rows }: { rows: Row[] }) {
  const points = rows.slice(0, 24);
  const max = Math.max(...points.map((row) => row.value), 1);
  const min = Math.min(...points.map((row) => row.value), 0);
  const span = max - min || 1;
  const step = points.length > 1 ? 300 / (points.length - 1) : 0;

  const coords = points.map((row, index) => {
    const x = index * step;
    const y = 90 - ((row.value - min) / span) * 80;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="mt-3">
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-[104px] w-full">
        <path d={coords.join(" ")} fill="none" stroke="var(--nx-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--nx-text-faint)]">
        <span className="truncate">{points[0]?.label}</span>
        <span className="truncate">{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function Donut({ rows }: { rows: Row[] }) {
  const slices = rows.slice(0, 6);
  const total = slices.reduce((sum, row) => sum + Math.abs(row.value), 0);

  if (total <= 0) {
    return (
      <p className="mt-3 text-[11.5px] text-[var(--nx-text-muted)]">
        Every value is zero, so there is no proportion to draw.
      </p>
    );
  }

  // Drawn as stroke dashes on one circle: no arc maths, and no risk of a
  // rounding gap between neighbouring segments.
  const circumference = 2 * Math.PI * 40;
  let offset = 0;

  return (
    <div className="mt-3 flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-[92px] w-[92px] shrink-0 -rotate-90">
        {slices.map((row, index) => {
          const fraction = Math.abs(row.value) / total;
          const dash = fraction * circumference;
          const circle = (
            <circle
              key={row.label}
              cx={50} cy={50} r={40}
              fill="none"
              stroke={SLICE_COLOURS[index % SLICE_COLOURS.length]}
              strokeWidth={16}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((row, index) => (
          <li key={row.label} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SLICE_COLOURS[index % SLICE_COLOURS.length] }}
            />
            <span className="truncate text-[var(--nx-text-muted)]">{row.label}</span>
            <span className="ml-auto shrink-0 tabular-nums">
              {Math.round((Math.abs(row.value) / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
