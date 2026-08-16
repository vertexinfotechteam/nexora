/**
 * Money as integers.
 *
 * Every monetary value in a document is stored in minor units (paise, cents)
 * as a plain integer. Floating point cannot represent 0.1 exactly, so a
 * document built from float arithmetic drifts by a rupee or two once you have
 * enough line items — and a quotation that does not add up destroys trust
 * faster than any missing feature.
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

export type Currency = {
  code: string;
  symbol: string;
  /** Digits after the decimal point. */
  decimals: number;
  locale: string;
};

export const CURRENCIES: Record<string, Currency> = {
  INR: { code: "INR", symbol: "₹", decimals: 2, locale: "en-IN" },
  USD: { code: "USD", symbol: "$", decimals: 2, locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", decimals: 2, locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", decimals: 2, locale: "en-GB" },
  AED: { code: "AED", symbol: "د.إ", decimals: 2, locale: "en-AE" },
  SGD: { code: "SGD", symbol: "S$", decimals: 2, locale: "en-SG" },
  AUD: { code: "AUD", symbol: "A$", decimals: 2, locale: "en-AU" },
  JPY: { code: "JPY", symbol: "¥", decimals: 0, locale: "ja-JP" },
};

export function getCurrency(code: string): Currency {
  return CURRENCIES[code?.toUpperCase()] ?? CURRENCIES.INR;
}

/** 12.5 -> 1250 for a 2-decimal currency. Rounds half away from zero. */
export function toMinor(amount: number, currency: Currency): number {
  if (!Number.isFinite(amount)) return 0;
  const factor = 10 ** currency.decimals;
  const scaled = amount * factor;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** currency.decimals;
}

export function formatMoney(minor: number, currency: Currency): string {
  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(fromMinor(minor, currency));
}

/**
 * Parses a money-ish string into minor units.
 *
 * Handles the shapes people actually paste: "₹1,200", "$1,299.50", "1200/-",
 * "Rs. 1,200", "1.299,50" (European), "1200 INR". Returns null when there is no
 * number at all, so a caller can tell "zero" apart from "absent".
 */
export function parseMoney(input: string, currency: Currency): number | null {
  if (typeof input !== "string") return null;

  let text = input
    .replace(/[₹$€£¥]/g, "")
    // The abbreviation's full stop must be consumed with it. Matching the dot
    // before the word boundary fails ("Rs." leaves a "."), and a leading dot is
    // then read as a decimal point — turning "Rs. 45,000" into 45.
    .replace(/\b(rs|inr|usd|eur|gbp|aed|sgd|aud|jpy)\b\.?/gi, "")
    .replace(/\/-/g, "")
    .replace(/\s/g, "")
    .trim();

  // Guard against any separator left stranded at either end.
  text = text.replace(/^[.,]+/, "").replace(/[.,]+$/, "");

  if (!text) return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/^[-(]|\)$/g, "");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  // Whichever separator comes last is the decimal point; the other groups.
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // A lone comma is a decimal separator only if it looks like one: exactly
    // two trailing digits and no other comma. "1,200" is twelve hundred.
    const decimals = text.length - lastComma - 1;
    const single = text.indexOf(",") === lastComma;
    text = single && decimals === 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  }

  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  const minor = toMinor(value, currency);
  return negative ? -minor : minor;
}

/** Parses a quantity, tolerating "2 x", "3 nos", "1.5 hrs". */
export function parseQuantity(input: string): number | null {
  if (typeof input !== "string") return null;
  const match = input.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Parses a percentage, tolerating "18%", "18 %", "gst 18". */
export function parsePercent(input: string): number | null {
  if (typeof input !== "string") return null;
  const match = input.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
