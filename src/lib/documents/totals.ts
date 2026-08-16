import { getCurrency, toMinor } from "@/lib/structure/money";
import type {
  BusinessDocument,
  DocumentTotals,
  LineItem,
  LineTotals,
} from "./types";

/**
 * Document arithmetic.
 *
 * All of it in integer minor units, and all of it here — the UI, the PDF and
 * the Excel export call this same function, so the three can never disagree.
 * The AI never computes any of these values.
 *
 * Rounding rule: round once per line at each stage (discount, then tax), which
 * is what tax authorities and accounting software both expect. Summing
 * unrounded line values and rounding at the end produces totals that are off by
 * a unit or two against a hand check.
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

/** Rounds half away from zero — the convention for currency, unlike Math.round. */
function roundMinor(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function computeLineTotals(
  item: LineItem,
  documentTaxPct: number,
): LineTotals {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unitPriceMinor)
    ? item.unitPriceMinor
    : 0;

  const grossMinor = roundMinor(quantity * unitPrice);

  const discountPct = clampPct(item.discountPct);
  const discountMinor = roundMinor((grossMinor * discountPct) / 100);
  const netMinor = grossMinor - discountMinor;

  // A line rate of null means "use the document rate"; 0 means "exempt".
  const effectiveTaxPct = clampPct(item.taxPct ?? documentTaxPct);
  const taxMinor = roundMinor((netMinor * effectiveTaxPct) / 100);

  return {
    grossMinor,
    discountMinor,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    effectiveTaxPct,
  };
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function computeDocumentTotals(
  document: Pick<
    BusinessDocument,
    "items" | "taxPct" | "discountPct" | "shippingMinor" | "currency"
  >,
): DocumentTotals {
  const documentTaxPct = clampPct(document.taxPct);
  const lines = document.items.map((item) =>
    computeLineTotals(item, documentTaxPct),
  );

  const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const lineDiscountMinor = lines.reduce(
    (sum, line) => sum + line.discountMinor,
    0,
  );
  const afterLineDiscount = subtotalMinor - lineDiscountMinor;

  // The document discount applies to the already-discounted net, not the gross.
  const documentDiscountPct = clampPct(document.discountPct);
  const documentDiscountMinor = roundMinor(
    (afterLineDiscount * documentDiscountPct) / 100,
  );
  const taxableMinor = afterLineDiscount - documentDiscountMinor;

  /*
   * The document discount reduces the taxable base, so each line's tax has to
   * be recomputed against its share of that reduction. Applying the discount
   * after tax would overstate the tax due.
   */
  const discountRatio =
    afterLineDiscount > 0 ? taxableMinor / afterLineDiscount : 1;

  const byRate = new Map<number, { taxableMinor: number; taxMinor: number }>();
  let taxMinor = 0;

  lines.forEach((line) => {
    const adjustedNet = roundMinor(line.netMinor * discountRatio);
    const adjustedTax = roundMinor((adjustedNet * line.effectiveTaxPct) / 100);
    taxMinor += adjustedTax;

    const bucket = byRate.get(line.effectiveTaxPct) ?? {
      taxableMinor: 0,
      taxMinor: 0,
    };
    bucket.taxableMinor += adjustedNet;
    bucket.taxMinor += adjustedTax;
    byRate.set(line.effectiveTaxPct, bucket);
  });

  const shippingMinor = Number.isFinite(document.shippingMinor)
    ? document.shippingMinor
    : 0;

  return {
    lines,
    subtotalMinor,
    lineDiscountMinor,
    documentDiscountMinor,
    totalDiscountMinor: lineDiscountMinor + documentDiscountMinor,
    taxableMinor,
    taxMinor,
    shippingMinor,
    grandTotalMinor: taxableMinor + taxMinor + shippingMinor,
    taxBreakdown: [...byRate.entries()]
      .filter(([pct, bucket]) => pct > 0 || bucket.taxMinor !== 0)
      .map(([pct, bucket]) => ({ pct, ...bucket }))
      .sort((a, b) => a.pct - b.pct),
  };
}

/** Converts a major-unit input (what the user types) into minor units. */
export function majorToMinor(value: number, currencyCode: string): number {
  return toMinor(value, getCurrency(currencyCode));
}
