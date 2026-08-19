import type { Point } from "@/lib/admin/operations";

/**
 * Two small charts for the overview.
 *
 * Drawn as plain SVG with a fixed viewBox rather than through a charting
 * library. They are decoration for a number that is already stated in words
 * above them, and the library route on this page previously shipped a chart
 * that measured its container as zero pixels wide and clipped every path away.
 * A viewBox scales itself and cannot do that.
 */

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_X = 4;
const PAD_Y = 8;

function scaleY(value: number, max: number): number {
  if (max <= 0) return VIEW_H - PAD_Y;
  return VIEW_H - PAD_Y - (value / max) * (VIEW_H - PAD_Y * 2);
}

function Frame({
  title,
  subtitle,
  points,
  children,
}: {
  title: string;
  subtitle: string;
  points: Point[];
  children: React.ReactNode;
}) {
  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";
  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="text-[11.5px] text-[var(--nx-text-muted)]">{subtitle}</span>
        <span className="ml-auto text-[12px] font-semibold tabular-nums">{total.toLocaleString()}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="mt-3 h-[150px] w-full"
        role="img"
        aria-label={`${title}: ${total} in total between ${first} and ${last}`}
      >
        {children}
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] text-[var(--nx-text-faint)]">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

/** Daily counts as bars. */
export function BarChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: Point[];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = (VIEW_W - PAD_X * 2) / Math.max(1, points.length);
  const width = Math.max(1.5, step * 0.62);

  return (
    <Frame title={title} subtitle={subtitle} points={points}>
      {points.map((p, i) => {
        const y = scaleY(p.value, max);
        return (
          <rect
            key={p.date}
            x={PAD_X + i * step + (step - width) / 2}
            y={y}
            width={width}
            height={Math.max(p.value > 0 ? 1.5 : 0, VIEW_H - PAD_Y - y)}
            rx={1}
            fill="var(--nx-accent)"
          />
        );
      })}
      <line
        x1={0} x2={VIEW_W} y1={VIEW_H - PAD_Y} y2={VIEW_H - PAD_Y}
        stroke="var(--nx-border)" strokeWidth={1}
      />
    </Frame>
  );
}

/** Daily counts as a filled line. */
export function AreaChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: Point[];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (VIEW_W - PAD_X * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [PAD_X + i * step, scaleY(p.value, max)] as const);

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1]?.[0].toFixed(1) ?? 0},${VIEW_H - PAD_Y} L${coords[0]?.[0].toFixed(1) ?? 0},${VIEW_H - PAD_Y} Z`;

  return (
    <Frame title={title} subtitle={subtitle} points={points}>
      <defs>
        <linearGradient id="nx-ops-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--nx-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--nx-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nx-ops-area)" />
      <path d={line} fill="none" stroke="var(--nx-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line
        x1={0} x2={VIEW_W} y1={VIEW_H - PAD_Y} y2={VIEW_H - PAD_Y}
        stroke="var(--nx-border)" strokeWidth={1}
      />
    </Frame>
  );
}
