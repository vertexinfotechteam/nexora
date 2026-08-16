/**
 * Generates a realistic sales dataset for exercising the pipeline end to end.
 *
 * Deliberately imperfect, so the profiler and quality score have something real
 * to report: some missing values, a handful of duplicate rows, a constant
 * column, and one genuine revenue spike for anomaly detection to find.
 *
 *   node scripts/make-sample-data.mjs [outfile] [days]
 */

import { writeFileSync } from "node:fs";

const outFile = process.argv[2] ?? "sample-sales.csv";
const days = Number(process.argv[3] ?? 730);

// Deterministic PRNG so the file is reproducible.
let seed = 20260813;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (items) => items[Math.floor(rand() * items.length)];
const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.7;

const CATEGORIES = [
  ["Electronics", 320, 0.34],
  ["Home & Garden", 95, 0.2],
  ["Apparel", 68, 0.18],
  ["Sports", 120, 0.13],
  ["Beauty", 45, 0.1],
  ["Books", 22, 0.05],
];
const CHANNELS = [
  ["Organic Search", 0.28],
  ["Paid Search", 0.22],
  ["Email", 0.16],
  ["Direct", 0.14],
  ["Social", 0.12],
  ["Affiliate", 0.08],
];
const SEGMENTS = ["Enterprise", "Mid-Market", "SMB", "Consumer", "Startup"];
const REGIONS = ["North America", "EMEA", "APAC", "LATAM"];

function weightedPick(table) {
  const roll = rand();
  let acc = 0;
  for (const row of table) {
    acc += row[row.length - 1];
    if (roll <= acc) return row;
  }
  return table[table.length - 1];
}

const start = new Date(Date.UTC(2024, 0, 1));
const rows = [];
let orderId = 100000;

for (let day = 0; day < days; day++) {
  const date = new Date(start);
  date.setUTCDate(start.getUTCDate() + day);
  const iso = date.toISOString().slice(0, 10);
  const weekday = date.getUTCDay();

  // Growth trend + weekly seasonality + a Q4 lift.
  const trend = 1 + day * 0.0011;
  const weekly = weekday === 0 || weekday === 6 ? 0.72 : 1.06;
  const month = date.getUTCMonth();
  const seasonal = month === 10 || month === 11 ? 1.35 : month === 0 ? 0.82 : 1;

  // One real, explainable spike: a campaign on 2025-05-29.
  const campaign = iso === "2025-05-29" ? 2.4 : iso === "2025-05-30" ? 1.5 : 1;

  const baseOrders = 26 * trend * weekly * seasonal * campaign;
  const orderCount = Math.max(3, Math.round(baseOrders + gauss() * 4));

  for (let i = 0; i < orderCount; i++) {
    const [category, basePrice] = weightedPick(CATEGORIES);
    const [channel] = weightedPick(CHANNELS);
    const quantity = 1 + Math.floor(rand() * 3);
    const unitPrice = Math.max(
      5,
      Math.round((basePrice * (1 + gauss() * 0.35)) * 100) / 100,
    );
    const discount = rand() < 0.22 ? Math.round(rand() * 25) : 0;
    const revenue =
      Math.round(unitPrice * quantity * (1 - discount / 100) * 100) / 100;

    rows.push({
      order_id: `ORD-${orderId++}`,
      order_date: iso,
      // ~3% of customer ids are missing, as real exports often are.
      customer_id: rand() < 0.03 ? "" : `CUST-${1000 + Math.floor(rand() * 4200)}`,
      category,
      channel,
      segment: pick(SEGMENTS),
      region: pick(REGIONS),
      quantity,
      unit_price: unitPrice,
      discount_pct: discount,
      revenue,
      // ~6% missing, to exercise the missing-value reporting.
      satisfaction_score:
        rand() < 0.06 ? "" : Math.min(5, Math.max(1, Math.round(3.9 + gauss()))),
      currency: "USD", // constant column — the profiler should flag this
    });
  }
}

// Inject exact duplicate rows so the duplicate count is non-zero and real.
for (let i = 0; i < 40; i++) {
  rows.push({ ...rows[Math.floor(rand() * rows.length)] });
}

const columns = Object.keys(rows[0]);
const escape = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csv = [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
].join("\n");

writeFileSync(outFile, csv, "utf8");

const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
console.log(`Wrote ${outFile}`);
console.log(`  rows:     ${rows.length.toLocaleString()}`);
console.log(`  columns:  ${columns.length}`);
console.log(`  period:   2024-01-01 to ${rows[rows.length - 41].order_date}`);
console.log(`  revenue:  ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
console.log(`  duplicates injected: 40`);
