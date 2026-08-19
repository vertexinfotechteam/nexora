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
   *
   * pdfjs-dist is here for a different reason: it loads its worker and its
   * standard font metrics by resolving paths relative to its own file. Bundled,
   * those paths point into .next/ where neither file exists, and every PDF
   * upload fails with "Setting up fake worker failed". Left external, it is
   * required straight out of node_modules and resolves its own assets.
   */
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "exceljs",
    "@react-pdf/renderer",
    "pdfjs-dist",
  ],

  /*
   * Ship DuckDB's native library with the routes that load it.
   *
   * The package is external (above), so it is required from node_modules at
   * runtime rather than bundled. Tracing follows `require` calls it can see,
   * and the binding resolves its .node/.so by building a path at runtime —
   * invisible to static analysis. The files were therefore left out of the
   * deployed function, and every upload and every analysis failed in
   * production with "libduckdb.so: cannot open shared object file", while
   * working perfectly on a developer machine where node_modules is simply
   * there.
   *
   * Scoped to the routes that genuinely need it: the library is tens of
   * megabytes, and a serverless function has a size limit worth respecting.
   */
  outputFileTracingIncludes: {
    "/api/analysis/**": ["./node_modules/@duckdb/**/*"],
    "/api/datasets/**": ["./node_modules/@duckdb/**/*"],
    "/explore": ["./node_modules/@duckdb/**/*"],
  },

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
