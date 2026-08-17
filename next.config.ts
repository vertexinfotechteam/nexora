import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 * CSP itself is emitted per-request from `src/proxy.ts` so it can carry a nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * Pages that require a session.
 *
 * Anything rendered here contains one account's data, so no copy of it may be
 * written to disk or kept in the browser's back/forward cache. Without this a
 * signed-out user pressing Back can be shown the dashboard they just left,
 * because a restore from bfcache never asks the server.
 *
 * Keep in step with the directories under `src/app/(app)/`.
 */
const AUTHENTICATED_ROUTES = [
  "/admin",
  "/alerts",
  "/anomalies",
  "/ask-ai",
  "/cohorts",
  "/dashboard",
  "/dashboards",
  "/data-quality",
  "/data-studio",
  "/datasets",
  "/explore",
  "/forecasting",
  "/governance",
  "/metrics",
  "/models",
  "/recommendations",
  "/reports",
  "/settings",
  "/studio",
  "/upgrade",
];

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const nextConfig: NextConfig = {
  /*
   * Next's development indicator defaults to bottom-left, which is exactly
   * where the sidebar's Collapse control sits — the badge covered it and took
   * the click. Moved to the opposite corner.
   *
   * It only ever renders in development; production builds never show it.
   */
  devIndicators: { position: "bottom-right" },

  /**
   * DuckDB and ExcelJS are native/CJS-heavy packages — they must stay external
   * to the server bundle or Turbopack will try to trace their .node binaries.
   */
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "exceljs",
    "@react-pdf/renderer",
  ],

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Applied here rather than only in proxy.ts because Next sets its own
      // Cache-Control while rendering a page, which overwrites whatever the
      // proxy put on the response. next.config headers are applied last and
      // therefore win.
      ...AUTHENTICATED_ROUTES.flatMap((route) => [
        { source: route, headers: noStoreHeaders },
        { source: `${route}/:path*`, headers: noStoreHeaders },
      ]),
    ];
  },
};

export default nextConfig;
