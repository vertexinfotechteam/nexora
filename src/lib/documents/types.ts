/**
 * The editable business document produced from raw pasted data.
 *
 * Everything a user can change lives here. The totals are never stored — they
 * are recomputed from the line items on every render and every export, so a
 * document can never be saved with a total that disagrees with its own rows.
 */

export type DocumentKind = "quotation" | "invoice" | "estimate" | "receipt";

export type LineItem = {
  id: string;
  description: string;
  /** Free text: "hours", "units", "days". Shown next to the quantity. */
  unit: string;
  quantity: number;
  /** Minor units. */
  unitPriceMinor: number;
  /** Per-line discount percentage, 0-100. */
  discountPct: number;
  /** Per-line tax percentage. Falls back to the document rate when null. */
  taxPct: number | null;
};

export type PartyDetails = {
  name: string;
  email: string;
  phone: string;
  address: string;
  /** GSTIN, VAT number, company registration — whatever applies. */
  taxId: string;
};

export type PaymentDetails = {
  /** "Due on receipt", "Net 30", or anything the user types. */
  terms: string;
  dueDate: string;
  method: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscSwift: string;
  upiId: string;
  /** Shown as a note under the payment block. */
  instructions: string;
};

export type BusinessDocument = {
  id: string;
  organization_id: string;
  created_by: string;
  kind: DocumentKind;
  /** Human reference, e.g. "QT-2026-014". */
  reference: string;
  title: string;
  issueDate: string;
  currency: string;

  from: PartyDetails;
  to: PartyDetails;

  items: LineItem[];

  /** Document-level tax percentage, applied to lines with no own rate. */
  taxPct: number;
  taxLabel: string;
  /** Document-level discount applied after line discounts. */
  discountPct: number;
  /** Flat amount added, e.g. shipping. Minor units. */
  shippingMinor: number;

  notes: string;
  termsAndConditions: string;
  payment: PaymentDetails;

  /** Whether to print the signature block. */
  showSignature: boolean;

  /**
   * Public share token. Null until the owner creates a link; removing it
   * revokes access immediately.
   */
  shareToken?: string | null;
  shareViewCount?: number;
  shareLastViewedAt?: string | null;

  /** The text the document was built from, kept for provenance. */
  sourceText: string;
  /** How the items were produced. Shown to the user, never invented. */
  structuredBy: string;

  created_at: string;
  updated_at: string;
};

export type LineTotals = {
  /** quantity × unit price, before any discount. */
  grossMinor: number;
  discountMinor: number;
  /** gross − discount. */
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  effectiveTaxPct: number;
};

export type DocumentTotals = {
  lines: LineTotals[];
  subtotalMinor: number;
  lineDiscountMinor: number;
  documentDiscountMinor: number;
  totalDiscountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  shippingMinor: number;
  grandTotalMinor: number;
  /** Tax split by rate, for a compliant tax summary. */
  taxBreakdown: { pct: number; taxableMinor: number; taxMinor: number }[];
};

export const DEFAULT_TERMS = `1. This quotation is valid for 30 days from the date of issue.
2. Work begins once the advance payment is received and the brief is confirmed in writing.
3. The scope covers the items listed above. Anything additional will be quoted separately before it is started.
4. Two rounds of revisions are included per deliverable. Further revisions are billed at the hourly rate.
5. Timelines assume feedback within three working days of each submission.
6. All amounts are in the currency shown and exclude bank charges.
7. Ownership of the final deliverables transfers on receipt of full payment.`;

export const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Please quote the reference number shown above with your payment so it can be matched to this document.";

export function emptyParty(): PartyDetails {
  return { name: "", email: "", phone: "", address: "", taxId: "" };
}

export function emptyPayment(): PaymentDetails {
  return {
    terms: "50% advance, balance on delivery",
    dueDate: "",
    method: "Bank transfer",
    bankName: "",
    accountName: "",
    accountNumber: "",
    ifscSwift: "",
    upiId: "",
    instructions: DEFAULT_PAYMENT_INSTRUCTIONS,
  };
}

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  estimate: "Estimate",
  receipt: "Receipt",
};
