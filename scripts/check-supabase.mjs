/**
 * Verifies the Supabase project is wired up correctly.
 *
 *   node scripts/check-supabase.mjs
 *
 * Checks, in order: env vars present, project reachable, both keys accepted,
 * every table the app uses exists, the storage bucket exists and is private,
 * the username-login helpers are installed, and RLS actually blocks anonymous
 * reads. Exits non-zero if anything required is missing.
 */

import { readFileSync } from "node:fs";

function loadEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(".env.local"), ...process.env };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SEC = env.SUPABASE_SERVICE_ROLE_KEY;

const TABLES = [
  "profiles",
  "organizations",
  "organization_members",
  "datasets",
  "dataset_files",
  "dataset_columns",
  "dataset_profiles",
  "analysis_jobs",
  "analysis_results",
  "anomalies",
  "forecasts",
  "recommendations",
  "reports",
  "report_branding",
  "business_documents",
  "usage_events",
  "audit_logs",
];

let failures = 0;
const ok = (message) => console.log(`  ✓ ${message}`);
const bad = (message) => {
  console.log(`  ✗ ${message}`);
  failures++;
};
const warn = (message) => console.log(`  ! ${message}`);

console.log("\nNexus → Supabase connection check\n");

// --- 1. configuration ------------------------------------------------------
console.log("Configuration");
if (!URL) bad("NEXT_PUBLIC_SUPABASE_URL is not set");
else ok(`project URL ${URL}`);
if (!PUB) bad("publishable / anon key is not set");
else ok(`publishable key ${PUB.slice(0, 12)}…`);
if (!SEC) bad("SUPABASE_SERVICE_ROLE_KEY is not set");
else ok(`secret key ${SEC.slice(0, 10)}…`);

if (failures > 0) {
  console.log("\nFix the configuration above, then run this again.\n");
  process.exit(1);
}

const rest = (path, key) =>
  fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

// --- 2. reachability -------------------------------------------------------
console.log("\nConnectivity");
try {
  const health = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUB } });
  if (health.ok) ok("auth service reachable");
  else bad(`auth service returned HTTP ${health.status}`);
} catch (error) {
  bad(`cannot reach the project: ${error.message}`);
  console.log("\nCheck the URL and your network, then run this again.\n");
  process.exit(1);
}

// --- 3. schema -------------------------------------------------------------
console.log("\nSchema");
const missing = [];
for (const table of TABLES) {
  const response = await rest(`${table}?select=*&limit=1`, SEC);
  if (response.status === 404) missing.push(table);
}
if (missing.length === 0) {
  ok(`all ${TABLES.length} tables present`);
} else if (missing.length === TABLES.length) {
  bad("no tables found — the migration has not been run");
  console.log(
    "\n    Open the Supabase SQL Editor, paste the whole of",
    "\n    supabase/migrations/0001_nexora_init.sql and run it once.\n",
  );
} else {
  bad(`missing ${missing.length} table(s): ${missing.join(", ")}`);
  console.log("    Re-run the migration; it is safe to run more than once.");
}

// --- 4. storage ------------------------------------------------------------
console.log("\nStorage");
try {
  const buckets = await fetch(`${URL}/storage/v1/bucket`, {
    headers: { apikey: SEC, Authorization: `Bearer ${SEC}` },
  });
  if (buckets.ok) {
    const list = await buckets.json();
    const datasets = list.find((bucket) => bucket.id === "datasets");
    if (!datasets) bad("the 'datasets' bucket does not exist");
    else if (datasets.public) bad("the 'datasets' bucket is PUBLIC — it must be private");
    else ok("'datasets' bucket exists and is private");
  } else {
    bad(`storage API returned HTTP ${buckets.status}`);
  }
} catch (error) {
  bad(`storage check failed: ${error.message}`);
}

// --- 5. helper functions ---------------------------------------------------
console.log("\nUsername login helpers");
for (const [fn, body] of [
  ["username_available", { p_username: "nexora_probe_zzz" }],
  ["email_for_username", { p_username: "nexora_probe_zzz" }],
]) {
  const response = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SEC,
      Authorization: `Bearer ${SEC}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.ok) ok(`${fn}() installed`);
  else bad(`${fn}() missing or not callable (HTTP ${response.status})`);
}

// --- 6. RLS ----------------------------------------------------------------
console.log("\nRow level security");
if (missing.length === TABLES.length) {
  warn("skipped — run the migration first");
} else {
  // The anonymous key must not be able to read tenant data.
  const anon = await rest("datasets?select=*&limit=1", PUB);
  if (anon.status === 200) {
    const rows = await anon.json();
    if (Array.isArray(rows) && rows.length === 0) {
      ok("anonymous reads return nothing (RLS is filtering)");
    } else {
      bad("anonymous key can read dataset rows — RLS is NOT protecting this table");
    }
  } else if ([401, 403].includes(anon.status)) {
    ok(`anonymous reads rejected (HTTP ${anon.status})`);
  } else {
    warn(`unexpected status ${anon.status} for the anonymous read probe`);
  }
}

// --- summary ---------------------------------------------------------------
console.log("");
if (failures === 0) {
  console.log("All checks passed. Supabase is ready.\n");
} else {
  console.log(`${failures} check(s) failed. See the notes above.\n`);
  process.exit(1);
}
