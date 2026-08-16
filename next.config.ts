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

const nextConfig: NextConfig = {
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
