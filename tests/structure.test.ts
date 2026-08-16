import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMoney,
  getCurrency,
  parseMoney,
  parsePercent,
  parseQuantity,
  toMinor,
} from "../src/lib/structure/money.ts";
import { collectSourceAmounts, parseRawData } from "../src/lib/structure/parse.ts";

const INR = getCurrency("INR");
const USD = getCurrency("USD");
const JPY = getCurrency("JPY");

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

test("toMinor avoids float drift", () => {
  assert.equal(toMinor(12.5, INR), 1250);
  assert.equal(toMinor(0.1, INR), 10);
  assert.equal(toMinor(1199.99, INR), 119999);
  // The classic float trap: 0.1 + 0.2 !== 0.3
  assert.equal(toMinor(0.1, INR) + toMinor(0.2, INR), toMinor(0.3, INR));
});

test("toMinor respects zero-decimal currencies", () => {
  assert.equal(toMinor(1200, JPY), 1200);
});

test("parseMoney handles the shapes people paste", () => {
  assert.equal(parseMoney("₹1,200", INR), 120000);
  assert.equal(parseMoney("$1,299.50", USD), 129950);
  assert.equal(parseMoney("Rs. 45,000", INR), 4500000);
  assert.equal(parseMoney("1200/-", INR), 120000);
  assert.equal(parseMoney("15000 INR", INR), 1500000);
  assert.equal(parseMoney("  899  ", INR), 89900);
});

test("parseMoney reads European grouping correctly", () => {
  // 1.299,50 is one thousand two hundred ninety-nine and fifty cents.
  assert.equal(parseMoney("1.299,50", USD), 129950);
  // 1,200 with no decimals is twelve hundred, not 1.2
  assert.equal(parseMoney("1,200", INR), 120000);
  // 12,50 with exactly two trailing digits is a decimal comma.
  assert.equal(parseMoney("12,50", USD), 1250);
});

test("parseMoney distinguishes absent from zero", () => {
  assert.equal(parseMoney("", INR), null);
  assert.equal(parseMoney("no charge", INR), null);
  assert.equal(parseMoney("0", INR), 0);
});

test("parseMoney handles negatives and parentheses", () => {
  assert.equal(parseMoney("-500", INR), -50000);
  assert.equal(parseMoney("(500)", INR), -50000);
});

test("formatMoney round-trips", () => {
  assert.equal(formatMoney(120000, USD), "$1,200.00");
});

test("parseQuantity and parsePercent tolerate units", () => {
  assert.equal(parseQuantity("2 x"), 2);
  assert.equal(parseQuantity("3 nos"), 3);
  assert.equal(parseQuantity("1.5 hrs"), 1.5);
  assert.equal(parsePercent("18%"), 18);
  assert.equal(parsePercent("gst 18"), 18);
});

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

test("parses a dash-separated list", () => {
  const { items } = parseRawData(
    `Logo design - 15000
Website redesign - 45000
Business cards - 3500`,
  );
  assert.equal(items.length, 3);
  assert.equal(items[0].description, "Logo design");
  assert.equal(items[0].unitPriceMinor, 1500000);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[2].unitPriceMinor, 350000);
});

test("parses bullets, currency symbols and grouping", () => {
  const { items } = parseRawData(
    `• Brand strategy workshop — ₹1,25,000
- Social media kit: ₹35,000
1. Packaging design ₹78,500`,
  );
  assert.equal(items.length, 3);
  assert.equal(items[0].description, "Brand strategy workshop");
  assert.equal(items[0].unitPriceMinor, 12500000);
  assert.equal(items[1].description, "Social media kit");
  assert.equal(items[2].description, "Packaging design");
  assert.equal(items[2].unitPriceMinor, 7850000);
});

test("parses quantity prefixes and suffixes", () => {
  const { items } = parseRawData(
    `2x Landing page 25000
Consulting session x 4 8000`,
  );
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].description, "Landing page");
  assert.equal(items[0].unitPriceMinor, 2500000);
  assert.equal(items[1].quantity, 4);
  assert.equal(items[1].description, "Consulting session");
});

test("parses delimited rows with quantity and rate", () => {
  const { items } = parseRawData(
    `Item, Qty, Rate
Logo design, 2, 15000
Brochure, 3, 4500`,
  );
  assert.equal(items.length, 2, "the header row must not become an item");
  assert.equal(items[0].description, "Logo design");
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unitPriceMinor, 1500000);
  assert.equal(items[1].quantity, 3);
});

test("skips totals and boilerplate rather than turning them into items", () => {
  const { items, skipped } = parseRawData(
    `Logo design - 15000
Subtotal: 15000
GST 18%: 2700
Total: 17700
Thank you for your business`,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].description, "Logo design");
  assert.ok(skipped.length >= 3);
});

test("keeps items that carry no price", () => {
  const { items } = parseRawData(
    `Logo design - 15000
Revisions included`,
  );
  assert.equal(items.length, 2);
  assert.equal(items[1].description, "Revisions included");
  assert.equal(items[1].unitPriceMinor, null);
});

test("collectSourceAmounts finds every number in the text", () => {
  const amounts = collectSourceAmounts("Logo 15000 and website ₹45,000", INR);
  assert.ok(amounts.includes(1500000));
  assert.ok(amounts.includes(4500000));
});

test("returns nothing rather than guessing on unparseable text", () => {
  const { items } = parseRawData("Hello, hope you are well.\nSpeak soon.");
  // Prose with no prices should not silently become priced line items.
  assert.ok(items.every((item) => item.unitPriceMinor === null));
});

/* -------------------------------------------------------------------------- */
/* Document totals                                                            */
/* -------------------------------------------------------------------------- */

import { computeDocumentTotals } from "../src/lib/documents/totals.ts";
import type { LineItem } from "../src/lib/documents/types.ts";

const line = (over: Partial<LineItem> = {}): LineItem => ({
  id: Math.random().toString(36).slice(2),
  description: "Item",
  unit: "",
  quantity: 1,
  unitPriceMinor: 100000,
  discountPct: 0,
  taxPct: null,
  ...over,
});

test("totals add up exactly with no float drift", () => {
  const totals = computeDocumentTotals({
    items: [
      line({ quantity: 3, unitPriceMinor: 1000 }), // 0.1 x 3
      line({ quantity: 3, unitPriceMinor: 2000 }), // 0.2 x 3
    ],
    taxPct: 0,
    discountPct: 0,
    shippingMinor: 0,
    currency: "INR",
  });
  assert.equal(totals.subtotalMinor, 9000);
  assert.equal(totals.grandTotalMinor, 9000);
});

test("line discount and tax apply in the right order", () => {
  const totals = computeDocumentTotals({
    items: [line({ quantity: 2, unitPriceMinor: 100000, discountPct: 10 })],
    taxPct: 18,
    discountPct: 0,
    shippingMinor: 0,
    currency: "INR",
  });
  assert.equal(totals.subtotalMinor, 200000);
  assert.equal(totals.lineDiscountMinor, 20000);
  assert.equal(totals.taxableMinor, 180000);
  // Tax is charged on the discounted amount, not the gross.
  assert.equal(totals.taxMinor, 32400);
  assert.equal(totals.grandTotalMinor, 212400);
});

test("document discount reduces the taxable base before tax", () => {
  const totals = computeDocumentTotals({
    items: [line({ unitPriceMinor: 100000 })],
    taxPct: 10,
    discountPct: 50,
    shippingMinor: 0,
    currency: "INR",
  });
  assert.equal(totals.documentDiscountMinor, 50000);
  assert.equal(totals.taxableMinor, 50000);
  // 10% of 500.00, not of 1000.00
  assert.equal(totals.taxMinor, 5000);
  assert.equal(totals.grandTotalMinor, 55000);
});

test("a per-line tax rate overrides the document rate", () => {
  const totals = computeDocumentTotals({
    items: [
      line({ unitPriceMinor: 100000, taxPct: 5 }),
      line({ unitPriceMinor: 100000, taxPct: null }),
      line({ unitPriceMinor: 100000, taxPct: 0 }),
    ],
    taxPct: 18,
    discountPct: 0,
    shippingMinor: 0,
    currency: "INR",
  });
  assert.equal(totals.taxMinor, 5000 + 18000 + 0);
  const rates = totals.taxBreakdown.map((b) => b.pct);
  assert.deepEqual(rates, [5, 18], "a 0% band carries no tax to report");
});

test("shipping is added after tax and never taxed", () => {
  const totals = computeDocumentTotals({
    items: [line({ unitPriceMinor: 100000 })],
    taxPct: 10,
    discountPct: 0,
    shippingMinor: 25000,
    currency: "INR",
  });
  assert.equal(totals.taxMinor, 10000);
  assert.equal(totals.grandTotalMinor, 100000 + 10000 + 25000);
});

test("tax breakdown sums to the reported tax", () => {
  const totals = computeDocumentTotals({
    items: [
      line({ quantity: 3, unitPriceMinor: 33333, taxPct: 12 }),
      line({ quantity: 7, unitPriceMinor: 14285, taxPct: 5 }),
      line({ quantity: 2, unitPriceMinor: 99999, taxPct: 12 }),
    ],
    taxPct: 18,
    discountPct: 7,
    shippingMinor: 0,
    currency: "INR",
  });
  const summed = totals.taxBreakdown.reduce((sum, b) => sum + b.taxMinor, 0);
  assert.equal(summed, totals.taxMinor);
  // And the grand total is exactly its parts.
  assert.equal(
    totals.grandTotalMinor,
    totals.taxableMinor + totals.taxMinor + totals.shippingMinor,
  );
});

test("percentages are clamped rather than trusted", () => {
  const totals = computeDocumentTotals({
    items: [line({ unitPriceMinor: 100000, discountPct: 999 })],
    taxPct: -5,
    discountPct: 0,
    shippingMinor: 0,
    currency: "INR",
  });
  // 999% discount cannot make the total negative.
  assert.equal(totals.lineDiscountMinor, 100000);
  assert.equal(totals.taxableMinor, 0);
  assert.equal(totals.taxMinor, 0);
  assert.equal(totals.grandTotalMinor, 0);
});
