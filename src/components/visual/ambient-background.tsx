"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient data background.
 *
 * A fixed, non-interactive layer behind all content, built from the marks the
 * logo is made of: a drifting grid, columns that rise and settle like a bar
 * chart, a slow trend line that redraws itself, and sparse nodes that link to
 * their neighbours as they pass.
 *
 * Constraints this is built to, deliberately:
 *   - It must never compete with the content. Everything sits at low opacity
 *     and moves slowly enough to read as atmosphere rather than motion.
 *   - It must be cheap. Element counts scale with viewport area and are hard
 *     capped; neighbour search uses a spatial grid so cost stays roughly
 *     linear rather than O(n²).
 *   - It must respect `prefers-reduced-motion`: one static frame, no rAF loop.
 *   - It must cost nothing while the tab is hidden.
 */

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  tint: number;
  phase: number;
};

type Column = {
  x: number;
  width: number;
  /** Current and target heights, in fractions of the band height. */
  height: number;
  target: number;
  speed: number;
  tint: number;
};

type SeriesPoint = { value: number; target: number };

const LINK_DISTANCE = 130;
const MAX_NODES = 60;
const AREA_PER_NODE = 30_000;
const SERIES_POINTS = 26;

function readTints(element: HTMLElement): [string, string] {
  const styles = getComputedStyle(element);
  return [
    styles.getPropertyValue("--nx-ambient-1").trim() || "43, 49, 56",
    styles.getPropertyValue("--nx-ambient-2").trim() || "28, 138, 106",
  ];
}

export function AmbientBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let columns: Column[] = [];
    let series: SeriesPoint[] = [];
    let frame = 0;
    let running = true;
    let lastRetarget = 0;
    let tints = readTints(document.documentElement);

    /*
     * A 3x retina buffer triples fill cost for a layer nobody looks at
     * directly. Phones are capped harder still: they have the least GPU
     * headroom and the most pixels per CSS point, and this is a low-opacity
     * backdrop of soft dots and hairlines where the difference between 1.5x
     * and 2x is not visible — but it is a third of the fill cost, every frame.
     */
    const isPhone = window.matchMedia("(max-width: 768px)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2);

    /*
     * Ambient motion is slow by design, so half the frames carry all of the
     * meaning. Rendering at ~30fps on a phone halves the work this layer asks
     * of the main thread and leaves that time for scrolling, which is the one
     * thing the person is actually doing.
     */
    const minFrameMs = isPhone ? 1000 / 30 : 0;
    let lastDrawn = 0;

    const seedNodes = (count: number): Node[] =>
      Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        radius: 0.8 + Math.random() * 1.4,
        tint: Math.random() > 0.4 ? 1 : 0,
        phase: Math.random() * Math.PI * 2,
      }));

    const seedColumns = () => {
      // Columns occupy a band across the lower third, like a chart baseline.
      const slot = 46;
      const count = Math.min(30, Math.max(8, Math.floor(width / slot)));
      columns = Array.from({ length: count }, (_, index) => ({
        x: index * (width / count),
        width: (width / count) * 0.34,
        height: 0.2 + Math.random() * 0.6,
        target: 0.2 + Math.random() * 0.6,
        speed: 0.004 + Math.random() * 0.006,
        tint: Math.random() > 0.55 ? 1 : 0,
      }));
    };

    const seedSeries = () => {
      series = Array.from({ length: SERIES_POINTS }, () => {
        const value = 0.3 + Math.random() * 0.4;
        return { value, target: value };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.min(
        MAX_NODES,
        Math.max(14, Math.round((width * height) / AREA_PER_NODE)),
      );
      if (nodes.length === 0) nodes = seedNodes(target);
      else if (nodes.length > target) nodes = nodes.slice(0, target);
      else nodes.push(...seedNodes(target - nodes.length));

      seedColumns();
      if (series.length === 0) seedSeries();
    };

    /** Buckets nodes by cell so each tests only forward neighbours. */
    const drawLinks = () => {
      const cell = LINK_DISTANCE;
      const cols = Math.max(1, Math.ceil(width / cell));
      const buckets = new Map<number, number[]>();

      nodes.forEach((node, index) => {
        const key = Math.floor(node.y / cell) * cols + Math.floor(node.x / cell);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index);
        else buckets.set(key, [index]);
      });

      const offsets = [0, 1, cols - 1, cols, cols + 1];

      for (const [key, indices] of buckets) {
        for (const offset of offsets) {
          const neighbours = buckets.get(key + offset);
          if (!neighbours) continue;
          for (const a of indices) {
            for (const b of neighbours) {
              if (b <= a) continue;
              const first = nodes[a];
              const second = nodes[b];
              const dx = first.x - second.x;
              const dy = first.y - second.y;
              const distSq = dx * dx + dy * dy;
              if (distSq > LINK_DISTANCE * LINK_DISTANCE) continue;
              const strength = 1 - Math.sqrt(distSq) / LINK_DISTANCE;
              context.strokeStyle = `rgba(${tints[first.tint]}, ${(strength * 0.14).toFixed(3)})`;
              context.lineWidth = 0.6;
              context.beginPath();
              context.moveTo(first.x, first.y);
              context.lineTo(second.x, second.y);
              context.stroke();
            }
          }
        }
      }
    };

    /** Rising columns along the bottom, echoing the bars inside the logo. */
    const drawColumns = () => {
      const bandTop = height * 0.62;
      const bandHeight = height * 0.38;

      for (const column of columns) {
        const barHeight = column.height * bandHeight;
        const y = bandTop + (bandHeight - barHeight);
        const gradient = context.createLinearGradient(0, y, 0, bandTop + bandHeight);
        gradient.addColorStop(0, `rgba(${tints[column.tint]}, 0.10)`);
        gradient.addColorStop(1, `rgba(${tints[column.tint]}, 0)`);
        context.fillStyle = gradient;

        const radius = Math.min(4, column.width / 2);
        context.beginPath();
        context.roundRect(column.x, y, column.width, barHeight, [radius, radius, 0, 0]);
        context.fill();
      }
    };

    /** A slow trend line that keeps redrawing itself across the upper area. */
    const drawSeries = (time: number) => {
      if (series.length < 2) return;
      const bandTop = height * 0.14;
      const bandHeight = height * 0.34;
      const step = width / (series.length - 1);

      const points = series.map((point, index) => ({
        x: index * step,
        y: bandTop + (1 - point.value) * bandHeight,
      }));

      // Smooth the polyline so it reads as a trend, not a sawtooth.
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        context.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      context.lineTo(points[points.length - 1].x, points[points.length - 1].y);

      const stroke = context.createLinearGradient(0, 0, width, 0);
      stroke.addColorStop(0, `rgba(${tints[0]}, 0)`);
      stroke.addColorStop(0.25, `rgba(${tints[1]}, 0.30)`);
      stroke.addColorStop(0.75, `rgba(${tints[1]}, 0.30)`);
      stroke.addColorStop(1, `rgba(${tints[0]}, 0)`);
      context.strokeStyle = stroke;
      context.lineWidth = 1.5;
      context.stroke();

      // A marker travelling the line, like a cursor reading the series.
      const travel = ((time * 0.00004) % 1) * (points.length - 1);
      const index = Math.floor(travel);
      const next = Math.min(points.length - 1, index + 1);
      const t = travel - index;
      const markerX = points[index].x + (points[next].x - points[index].x) * t;
      const markerY = points[index].y + (points[next].y - points[index].y) * t;

      context.fillStyle = `rgba(${tints[1]}, 0.5)`;
      context.beginPath();
      context.arc(markerX, markerY, 2.6, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = `rgba(${tints[1]}, 0.18)`;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(markerX, markerY, 7, 0, Math.PI * 2);
      context.stroke();
    };

    const drawNodes = (time: number) => {
      for (const node of nodes) {
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.0006 + node.phase);
        context.fillStyle = `rgba(${tints[node.tint]}, ${(0.42 * pulse).toFixed(3)})`;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const render = (time: number) => {
      context.clearRect(0, 0, width, height);
      drawColumns();
      drawSeries(time);
      drawLinks();
      drawNodes(time);
    };

    const step = (time: number) => {
      if (!running) return;

      // Retarget the chart shapes occasionally so they breathe rather than loop.
      if (time - lastRetarget > 2600) {
        lastRetarget = time;
        for (const column of columns) column.target = 0.15 + Math.random() * 0.7;
        for (const point of series) point.target = 0.25 + Math.random() * 0.5;
      }

      for (const column of columns) {
        column.height += (column.target - column.height) * column.speed;
      }
      for (const point of series) {
        point.value += (point.target - point.value) * 0.006;
      }

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        // Wrap rather than bounce; bouncing creates visible edges.
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }

      // Skip the draw on frames we are deliberately not rendering; the
      // simulation above still advances, so the motion stays smooth and only
      // its sampling rate changes.
      if (time - lastDrawn >= minFrameMs) {
        lastDrawn = time;
        render(time);
      }
      frame = requestAnimationFrame(step);
    };

    resize();
    if (reduceMotion) render(0);
    else frame = requestAnimationFrame(step);

    const onResize = () => {
      resize();
      if (reduceMotion) render(0);
    };
    window.addEventListener("resize", onResize, { passive: true });

    const onVisibility = () => {
      if (reduceMotion) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Re-read the palette when the theme flips so the field recolours.
    const themeObserver = new MutationObserver(() => {
      tints = readTints(document.documentElement);
      if (reduceMotion) render(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className ?? ""}`}
    >
      {/* Drifting grid */}
      {/* Inset by one tile in every direction: the layer now drifts by a whole
          tile, so the edge it travels away from must start outside the frame or
          a bare strip would appear at the top-left. */}
      <div className="nx-ambient-grid absolute -inset-[60px]" />

      {/* Ambient glows in the mark's two colours */}
      <div className="nx-glow-purple absolute -left-[12%] -top-[18%] h-[62vh] w-[62vw] rounded-full blur-[120px]" />
      <div className="nx-glow-cyan absolute -right-[14%] top-[22%] h-[58vh] w-[58vw] rounded-full blur-[130px]" />

      {/* Data field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Vignette keeps the edges quiet behind content. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 40%, transparent 40%, var(--nx-bg) 100%)",
        }}
      />
    </div>
  );
}
