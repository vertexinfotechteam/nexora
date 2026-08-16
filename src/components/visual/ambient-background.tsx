"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient AI background.
 *
 * A fixed, non-interactive layer behind all content: a slow-drifting grid, two
 * ambient glows, and a canvas of sparse floating data nodes that link to their
 * near neighbours as they pass.
 *
 * Constraints this is built to, deliberately:
 *   - It must never compete with the dashboard. Everything sits at low opacity
 *     and moves slowly enough to read as atmosphere, not motion.
 *   - It must be cheap. Node count scales with viewport area and is hard-capped;
 *     neighbour search uses a spatial grid, so cost stays roughly linear rather
 *     than O(n²).
 *   - It must respect `prefers-reduced-motion`: one static frame, no rAF loop.
 *   - It must pause when the tab is hidden or the element scrolls out of view,
 *     so it costs nothing while the user is elsewhere.
 */

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0 = purple, 1 = cyan. Fixed per node so colours stay stable. */
  tint: number;
  /** Individual phase so pulsing does not happen in lockstep. */
  phase: number;
};

const LINK_DISTANCE = 132;
const MAX_NODES = 70;
/** One node per this many square pixels, before the cap. */
const AREA_PER_NODE = 26_000;

function readTints(element: HTMLElement): [string, string] {
  const styles = getComputedStyle(element);
  return [
    styles.getPropertyValue("--nx-ambient-1").trim() || "124, 92, 255",
    styles.getPropertyValue("--nx-ambient-2").trim() || "34, 211, 238",
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
    let frame = 0;
    let running = true;
    let tints = readTints(document.documentElement);

    // Cap the pixel ratio: a 3x retina buffer triples fill cost for a layer
    // nobody is looking at directly.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const seed = (count: number) =>
      Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        // Slow drift — a full crossing takes minutes, not seconds.
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        radius: 0.8 + Math.random() * 1.5,
        tint: Math.random() > 0.55 ? 1 : 0,
        phase: Math.random() * Math.PI * 2,
      }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.min(
        MAX_NODES,
        Math.max(18, Math.round((width * height) / AREA_PER_NODE)),
      );
      if (nodes.length === 0) nodes = seed(target);
      else if (nodes.length > target) nodes = nodes.slice(0, target);
      else if (nodes.length < target) nodes.push(...seed(target - nodes.length));
    };

    /**
     * Buckets nodes into cells the size of the link radius, so each node only
     * tests the 4 forward-neighbouring cells instead of every other node.
     */
    const drawLinks = () => {
      const cell = LINK_DISTANCE;
      const columns = Math.max(1, Math.ceil(width / cell));
      const buckets = new Map<number, number[]>();

      nodes.forEach((node, index) => {
        const key =
          Math.floor(node.y / cell) * columns + Math.floor(node.x / cell);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index);
        else buckets.set(key, [index]);
      });

      // Only forward offsets, so each pair is considered once.
      const offsets = [0, 1, columns - 1, columns, columns + 1];

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
              const distanceSq = dx * dx + dy * dy;
              if (distanceSq > LINK_DISTANCE * LINK_DISTANCE) continue;

              const strength = 1 - Math.sqrt(distanceSq) / LINK_DISTANCE;
              context.strokeStyle = `rgba(${tints[first.tint]}, ${(
                strength * 0.16
              ).toFixed(3)})`;
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

    const render = (time: number) => {
      context.clearRect(0, 0, width, height);
      drawLinks();

      for (const node of nodes) {
        // Gentle pulse so the field feels alive while standing still.
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.0006 + node.phase);
        context.fillStyle = `rgba(${tints[node.tint]}, ${(0.5 * pulse).toFixed(3)})`;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const step = (time: number) => {
      if (!running) return;

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        // Wrap rather than bounce — bouncing creates visible edges.
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }

      render(time);
      frame = requestAnimationFrame(step);
    };

    resize();

    if (reduceMotion) {
      // One static frame: the field is present, nothing moves.
      render(0);
    } else {
      frame = requestAnimationFrame(step);
    }

    const onResize = () => {
      resize();
      if (reduceMotion) render(0);
    };
    window.addEventListener("resize", onResize, { passive: true });

    // Stop entirely while the tab is in the background.
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

    // Re-read the palette when the theme flips, so the field recolours.
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
      <div className="nx-ambient-grid absolute inset-0" />

      {/* Ambient glows */}
      <div className="nx-glow-purple absolute -left-[10%] -top-[20%] h-[65vh] w-[65vw] rounded-full blur-[110px]" />
      <div className="nx-glow-cyan absolute -right-[12%] top-[25%] h-[55vh] w-[55vw] rounded-full blur-[120px]" />

      {/* Node field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Vignette keeps the edges from feeling busy behind content. */}
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
