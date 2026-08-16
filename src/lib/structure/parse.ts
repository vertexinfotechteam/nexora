import { getCurrency, parseMoney, parseQuantity, type Currency } from "./money";

/**
 * Deterministic raw-text → line items.
 *
 * This is the fallback when no AI provider is configured, and the safety net
 * when one is: whatever the model proposes is checked against what this parser
 * found in the source text, so a model cannot introduce a price that was never
 * written down.
 *
 * It handles the shapes people actually paste:
 *   - delimited rows        "Logo design, 2, 15000"
 *   - dash/colon pairs      "Logo design - 15000"  |  "Logo design: 15000"
 *   - quantity prefixes     "2x Logo design 15000"
 *   - bullets and numbering "1. Logo design — ₹15,000"
 *   - trailing amounts      "Website redesign 3 days 45000/-"
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

export type ParsedItem = {
  description: string;
  quantity: number;
  /** Minor units. Null when the line carried no price. */
  unitPriceMinor: number | null;
};

export type ParseResult = {
  items: ParsedItem[];
  /** Every distinct number found in the source, in minor units. */
  sourceAmounts: number[];
  /** Lines that produced no item, so the UI can show what was skipped. */
  skipped: string[];
  method: string;
};

const BULLET = /^\s*(?:[-*•·–—]|\(?\d+[.)])\s+/;
const NOISE_LINE =
  /^\s*(?:total|subtotal|grand\s*total|amount\s*due|balance|tax|gst|vat|discount|shipping|notes?|terms?|thank\s*you|invoice|quotation|quote|estimate|bill\s*to|ship\s*to|date|due\s*date|ref(?:erence)?)\b\s*[:\-]?/i;

/** Placeholder for a comma that groups digits rather than separating fields. */
const GROUP_COMMA = String.fromCharCode(1);

/**
 * Hides commas that sit inside a number so field-splitting cannot cut
 * "₹1,25,000" into three columns. Covers both western (1,234,567) and Indian
 * (12,34,567) grouping.
 */
function maskGroupingCommas(line: string): string {
  let previous: string;
  let current = line;
  // No whitespace around the comma: digit grouping is always written tight
  // ("1,25,000"), whereas a CSV separator is normally followed by a space
  // ("Logo design, 2, 15000"). That distinction is what keeps both readable.
  // Repeated because one pass consumes the digit the next match needs.
  do {
    previous = current;
    current = current.replace(/(\d),(\d)/g, `$1${GROUP_COMMA}$2`);
  } while (current !== previous);
  return current;
}

function unmask(text: string): string {
  return text.split(GROUP_COMMA).join(",");
}

/** Splits a line on a delimiter that appears consistently. */
function splitDelimited(line: string): string[] | null {
  for (const delimiter of ["\t", "|", ";"]) {
    if (line.includes(delimiter)) {
      return line.split(delimiter).map((part) => part.trim());
    }
  }
  // Commas separate fields only when they are not grouping digits.
  const masked = maskGroupingCommas(line);
  const commaParts = masked.split(",").map((part) => unmask(part).trim());
  if (commaParts.length >= 3) return commaParts;
  return null;
}

/** Pulls a leading "2x" / "3 nos" quantity off the front of a description. */
function extractLeadingQuantity(text: string): {
  quantity: number | null;
  rest: string;
} {
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|nos?\.?|pcs?\.?|units?)\s+/i);
  if (!match) return { quantity: null, rest: text };
  return {
    quantity: Number(match[1].replace(",", ".")),
    rest: text.slice(match[0].length).trim(),
  };
}

/** Pulls a trailing "x 3" / "qty 3" quantity off the end. */
function extractTrailingQuantity(text: string): {
  quantity: number | null;
  rest: string;
} {
  const match = text.match(/\s+(?:x|×|qty\.?|quantity)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  if (!match) return { quantity: null, rest: text };
  return {
    quantity: Number(match[1].replace(",", ".")),
    rest: text.slice(0, match.index).trim(),
  };
}

/** Finds a money token at the end of a line, which is where prices usually sit. */
function extractTrailingAmount(
  text: string,
  currency: Currency,
): { minor: number | null; rest: string } {
  const match = text.match(
    // No spaces inside the number: "2, 15000" is two values, not "215000".
    /(?:[-–—:]\s*)?((?:[₹$€£¥]\s*)?\d[\d,.]*(?:\/-)?\s*(?:rs|inr|usd|eur|gbp|aed|sgd|aud|jpy)?\.?)\s*$/i,
  );
  if (!match) return { minor: null, rest: text };

  const minor = parseMoney(match[1], currency);
  if (minor === null) return { minor: null, rest: text };

  const rest = text.slice(0, match.index).replace(/[-–—:,\s]+$/, "").trim();
  // A line that is nothing but a number is a total, not an item.
  if (!rest) return { minor: null, rest: text };

  return { minor, rest };
}

function cleanDescription(text: string): string {
  return text
    .replace(BULLET, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
}

/** Collects every distinct monetary value present in the raw text. */
export function collectSourceAmounts(raw: string, currency: Currency): number[] {
  const found = new Set<number>();
  const pattern = /(?:[₹$€£¥]\s*)?\d[\d,.]*(?:\/-)?/g;

  for (const match of raw.matchAll(pattern)) {
    const minor = parseMoney(match[0], currency);
    if (minor !== null) found.add(minor);
  }
  return [...found];
}

export function parseRawData(raw: string, currencyCode = "INR"): ParseResult {
  const currency = getCurrency(currencyCode);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const skipped: string[] = [];

  // A header row would otherwise become an item.
  const looksLikeHeader = (line: string) =>
    /^(?:s\.?\s*no\.?|sr\.?|item|description|particulars?|service|product)\b/i.test(
      line,
    ) && /\b(qty|quantity|rate|price|amount|total)\b/i.test(line);

  for (const line of lines) {
    if (NOISE_LINE.test(line) || looksLikeHeader(line)) {
      skipped.push(line);
      continue;
    }

    const withoutBullet = line.replace(BULLET, "").trim();
    if (!withoutBullet) continue;

    // --- delimited form -------------------------------------------------
    const parts = splitDelimited(withoutBullet);
    if (parts && parts.length >= 2) {
      const numericParts = parts
        .map((part, index) => ({ index, minor: parseMoney(part, currency) }))
        .filter((part) => part.minor !== null);

      if (numericParts.length > 0) {
        // Description is the first non-numeric part.
        const descriptionPart =
          parts.find(
            (part, index) =>
              !numericParts.some((numeric) => numeric.index === index) &&
              part.length > 0,
          ) ?? parts[0];

        // With 2+ numbers, the convention is [..., qty, rate] or [qty, rate].
        let quantity = 1;
        let unitPriceMinor = numericParts[numericParts.length - 1].minor!;

        if (numericParts.length >= 2) {
          const candidate = parseQuantity(parts[numericParts[0].index]);
          if (candidate !== null && candidate > 0 && candidate < 100_000) {
            quantity = candidate;
          }
        }

        const description = cleanDescription(descriptionPart);
        if (description) {
          items.push({ description, quantity, unitPriceMinor });
          continue;
        }
      }
    }

    // --- prose form -----------------------------------------------------
    // Order matters: the price is stripped first, because in
    // "Consulting session x 4 8000" the quantity is only at the end of the
    // line once the amount has been removed.
    let working = withoutBullet;

    const leading = extractLeadingQuantity(working);
    working = leading.rest;

    const amount = extractTrailingAmount(working, currency);
    working = amount.minor === null ? working : amount.rest;

    const trailingQty = extractTrailingQuantity(working);
    if (trailingQty.quantity !== null) working = trailingQty.rest;

    const description = cleanDescription(working);

    if (!description) {
      skipped.push(line);
      continue;
    }

    items.push({
      description,
      quantity: leading.quantity ?? trailingQty.quantity ?? 1,
      unitPriceMinor: amount.minor,
    });
  }

  return {
    items,
    sourceAmounts: collectSourceAmounts(raw, currency),
    skipped,
    method:
      items.length > 0
        ? "Pattern parser: delimiters, quantity prefixes and trailing amounts"
        : "Pattern parser found no line items",
  };
}
