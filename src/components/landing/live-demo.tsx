"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Hero showcase: a simulated live metric feed and an opinion poll.
 *
 * IMPORTANT: this is a *demonstration only*. It is generated in the browser
 * from a seeded random walk and is connected to nothing — no API, no database,
 * no user data. It exists to show what the product looks like in motion before
 * a visitor signs up. It is labelled as sample data on screen so no one can
 * mistake it for a real figure, which matters because everywhere else in this
 * product a number on screen is a computed fact.
 */

type Point = { t: number; label: string; revenue: number; sessions: number };

const WINDOW = 40;

function seededNoise(seed: number): number {
  // Deterministic per-tick jitter; avoids Math.random so the first paint after
  // hydration matches and the series looks continuous.
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function buildInitial(): Point[] {
  const now = Date.now();
  const points: Point[] = [];
  let revenue = 42000;
  let sessions = 1180;

  for (let i = WINDOW - 1; i >= 0; i--) {
    const t = now - i * 1500;
    revenue += seededNoise(i * 3 + 1) * 2600 + 140;
    sessions += seededNoise(i * 7 + 5) * 70 + 4;
    points.push({
      t,
      label: new Date(t).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      revenue: Math.max(8000, Math.round(revenue)),
      sessions: Math.max(200, Math.round(sessions)),
    });
  }
  return points;
}


/**
 * Width of an element, tracked with a ResizeObserver.
 *
 * Recharts' own ResponsiveContainer measured this card at zero and cached it:
 * the chart drew its paths, then the surrounding <svg width="0"> clipped every
 * one of them, so the card showed a blank panel while the KPI row above it
 * displayed figures from the same data. Measuring here removes the dependency
 * on its internals and gives the chart a width that is always real.
 *
 * Returns 0 until the first measurement, which is the signal to keep showing
 * the placeholder rather than render a zero-width chart.
 */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * True while the element is on screen and the tab is in front.
 *
 * These panels tick on a timer to look alive. That is the right behaviour
 * while someone is looking at them and pure waste otherwise — the landing page
 * is long, so for most of a visit both panels sit far outside the viewport
 * still re-rendering a chart nobody can see, on the main thread, competing
 * with the scroll that carried them away. Nothing about how they look or
 * behave while visible changes; they simply stop when there is no one to see.
 */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  /*
   * Starts running, and stops only once something reports the panel is out of
   * sight. The other way round — start paused, wait to be told it is visible —
   * puts the panel's normal behaviour at the mercy of an observer callback
   * arriving, and anywhere that callback does not arrive the panel is frozen
   * with no way back. Defaulting to on means the worst case is the behaviour
   * this had before: it simply keeps ticking.
   */
  const [active, setActive] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let onScreen = true;
    const sync = () => setActive(onScreen && !document.hidden);
    sync();

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      // A little margin so it is already running by the time it scrolls in.
      { rootMargin: "150px" },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return [ref, active] as const;
}

export function LiveDemoChart() {
  const [points, setPoints] = useState<Point[]>([]);
  const tick = useRef(0);
  const [chartRef, chartWidth] = useContainerWidth<HTMLDivElement>();
  const [panelRef, onScreen] = useOnScreen<HTMLDivElement>();

  // Build the series on the client only, so server and client markup agree.
  useEffect(() => {
    setPoints(buildInitial());
  }, []);

  useEffect(() => {
    if (points.length === 0 || !onScreen) return;
    const id = setInterval(() => {
      setPoints((previous) => {
        if (previous.length === 0) return previous;
        const last = previous[previous.length - 1];
        tick.current += 1;
        const t = Date.now();
        const next: Point = {
          t,
          label: new Date(t).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          revenue: Math.max(
            8000,
            Math.round(last.revenue + seededNoise(tick.current * 3.7) * 3200 + 190),
          ),
          sessions: Math.max(
            200,
            Math.round(last.sessions + seededNoise(tick.current * 9.1) * 90 + 6),
          ),
        };
        return [...previous.slice(-(WINDOW - 1)), next];
      });
    }, 1500);
    return () => clearInterval(id);
  }, [points.length, onScreen]);

  const latest = points[points.length - 1];
  const first = points[0];
  const changePct =
    latest && first && first.revenue !== 0
      ? ((latest.revenue - first.revenue) / first.revenue) * 100
      : 0;

  return (
    <div
      ref={panelRef}
      className="overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] shadow-[var(--nx-shadow-lg)]"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--nx-error)] opacity-70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--nx-accent)] opacity-70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--nx-success)] opacity-70" />
        </div>
        <span className="ml-1 text-[11px] font-medium text-[var(--nx-text-muted)]">
          Live operations board
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--nx-success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-success-fg)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--nx-success)] nx-live-dot" />
          Live
        </span>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-3 divide-x divide-[var(--nx-border)] border-b border-[var(--nx-border)]">
        <Metric
          icon={<BarChart3 className="h-3 w-3" />}
          label="Revenue / min"
          value={latest ? `$${formatNumber(latest.revenue)}` : "—"}
          delta={`${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          positive={changePct >= 0}
        />
        <Metric
          icon={<Users className="h-3 w-3" />}
          label="Active sessions"
          value={latest ? formatNumber(latest.sessions) : "—"}
        />
        <Metric
          icon={<Activity className="h-3 w-3" />}
          label="Pipeline"
          value="Healthy"
          positive
        />
      </div>

      {/* Chart */}
      <div ref={chartRef} className="w-full px-1 pt-3">
        {points.length === 0 || chartWidth === 0 ? (
          <div className="h-[150px] animate-pulse" />
        ) : (
          <AreaChart
            width={chartWidth}
            height={150}
            data={points}
            margin={{ top: 4, right: 14, bottom: 0, left: 4 }}
          >
              <defs>
                <linearGradient id="nx-hero-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--nx-series-1)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--nx-series-1)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--nx-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--nx-text-faint)", fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "var(--nx-border)" }}
                minTickGap={44}
              />
              <YAxis
                width={46}
                tick={{ fill: "var(--nx-text-faint)", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              <Tooltip
                cursor={{ stroke: "var(--nx-border-strong)" }}
                contentStyle={{
                  background: "var(--nx-inset)",
                  border: "1px solid var(--nx-border)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--nx-text)",
                }}
                labelStyle={{ color: "var(--nx-text-muted)" }}
                formatter={(value) => [formatNumber(Number(value)), "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--nx-series-1)"
                strokeWidth={2}
                fill="url(#nx-hero-fill)"
                isAnimationActive={false}
              />
          </AreaChart>
        )}
      </div>

      <p className="border-t border-[var(--nx-border)] px-3 py-1.5 text-[10px] text-[var(--nx-text-faint)]">
        Sample data, generated in your browser for demonstration. Your own
        dashboard shows only figures computed from data you upload.
      </p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  delta,
  positive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--nx-text-faint)]">
        {icon}
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[16px] font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "text-[10.5px] font-medium",
              positive ? "text-[var(--nx-success)]" : "text-[var(--nx-error)]",
            )}
          >
            {delta}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Poll                                                                       */
/* -------------------------------------------------------------------------- */

const POLL_OPTIONS = [
  { id: "hours", label: "Hours waiting on an analyst", base: 41 },
  { id: "trust", label: "Not trusting the numbers", base: 27 },
  { id: "tools", label: "Too many disconnected tools", base: 19 },
  { id: "skills", label: "Nobody on the team writes SQL", base: 13 },
];

/**
 * Illustrative poll. Votes are local to this browser session and are not
 * transmitted or stored anywhere — the label on the card says so.
 */
export function LiveDemoPoll() {
  const [voted, setVoted] = useState<string | null>(null);
  const [drift, setDrift] = useState(0);
  const [panelRef, onScreen] = useOnScreen<HTMLDivElement>();

  // Small drift so the bars feel alive without pretending to be a live tally.
  useEffect(() => {
    if (!onScreen) return;
    const id = setInterval(() => setDrift((d) => d + 1), 4000);
    return () => clearInterval(id);
  }, [onScreen]);

  const results = useMemo(() => {
    const raw = POLL_OPTIONS.map((option, index) => ({
      ...option,
      value: Math.max(
        4,
        option.base + seededNoise(drift * 5 + index * 11) * 4 + (voted === option.id ? 2 : 0),
      ),
    }));
    const total = raw.reduce((sum, option) => sum + option.value, 0);
    return raw.map((option) => ({
      ...option,
      pct: (option.value / total) * 100,
    }));
  }, [drift, voted]);

  return (
    <div
      ref={panelRef}
      className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4 shadow-[var(--nx-shadow)]"
    >
      <div className="mb-3 flex items-start gap-2">
        <div>
          <p className="text-[12.5px] font-semibold">
            What slows your reporting down most?
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--nx-text-muted)]">
            {voted
              ? "Thanks — here is how others answered."
              : "Pick one to see the breakdown."}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[var(--nx-purple-soft)] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nx-purple-fg)]">
          Poll
        </span>
      </div>

      <ul className="space-y-1.5">
        {results.map((option) => {
          const chosen = voted === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => setVoted(option.id)}
                aria-pressed={chosen}
                className={cn(
                  "relative w-full overflow-hidden rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  chosen
                    ? "border-[var(--nx-purple)] bg-[var(--nx-purple-soft)]"
                    : "border-[var(--nx-border)] hover:border-[var(--nx-border-strong)]",
                )}
              >
                {voted ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--nx-purple-soft)] transition-[width] duration-700"
                    style={{ width: `${option.pct}%` }}
                  />
                ) : null}
                <span className="relative flex items-center gap-2">
                  {chosen ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--nx-purple)]" />
                  ) : null}
                  <span className="text-[12px]">{option.label}</span>
                  {voted ? (
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--nx-text-muted)]">
                      {option.pct.toFixed(0)}%
                    </span>
                  ) : (
                    <ArrowUpRight className="ml-auto h-3 w-3 text-[var(--nx-text-faint)]" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[10px] text-[var(--nx-text-faint)]">
        Illustrative only. Your response stays in this browser and is not sent
        anywhere.
      </p>
    </div>
  );
}
