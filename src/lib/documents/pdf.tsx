import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { computeDocumentTotals } from "./totals";
import { formatMoney, getCurrency } from "@/lib/structure/money";
import { DOCUMENT_KIND_LABELS, type BusinessDocument } from "./types";
import type { Branding } from "@/lib/branding";

/**
 * Business document PDF — quotation, invoice, estimate or receipt.
 *
 * Every figure comes from computeDocumentTotals, the same function the editor
 * and the Excel export use, so the three can never disagree. Nothing is
 * recomputed here.
 */

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  panel: "#f8fafc",
  accent: "#0a4a3c",
};

/** The built-in fonts are WinAnsi only; ₹ and ₩ are outside it. */
const GLYPHS: [RegExp, string][] = [
  [/₹/g, "Rs."],
  [/[—–]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
  [/×/g, "x"],
];

function t(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  for (const [pattern, replacement] of GLYPHS) text = text.replace(pattern, replacement);
  return text.replace(/[^ -ÿ]/g, "");
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9,
    color: C.body,
    fontFamily: "Helvetica",
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  logo: { width: 110, height: 36, objectFit: "contain", marginBottom: 6 },
  fromName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  fromLine: { fontSize: 8.5, color: C.muted, marginTop: 1.5 },
  docType: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    textAlign: "right",
    letterSpacing: 1,
  },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  metaLabel: { fontSize: 8.5, color: C.muted, marginRight: 6 },
  metaValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink },
  partyBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
    marginBottom: 14,
  },
  partyLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  partyName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 10 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.accent,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  td: { fontSize: 8.5, color: C.body },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 2.5 },
  totalsLabel: { fontSize: 9, color: C.muted, width: 130, textAlign: "right", paddingRight: 10 },
  totalsValue: { fontSize: 9, color: C.ink, width: 100, textAlign: "right" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1.5,
    borderTopColor: C.ink,
    marginTop: 4,
    paddingTop: 6,
  },
  grandLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    width: 130,
    textAlign: "right",
    paddingRight: 10,
  },
  grandValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    width: 100,
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 4,
  },
  bodyText: { fontSize: 8.5, lineHeight: 1.5, color: C.body },
  panel: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    padding: 9,
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.faint,
  },
});

/* Column widths must sum to 100%. */
const COLUMNS = {
  index: "5%",
  description: "43%",
  qty: "10%",
  rate: "16%",
  tax: "10%",
  amount: "16%",
} as const;

function PartyColumn({
  label,
  party,
  align = "left",
}: {
  label: string;
  party: BusinessDocument["from"];
  align?: "left" | "right";
}) {
  const lines = [party.address, party.phone, party.email, party.taxId].filter(
    (line) => line && line.trim().length > 0,
  );
  return (
    <View style={{ width: "48%", alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={[styles.partyName, { textAlign: align }]}>
        {t(party.name) || "-"}
      </Text>
      {lines.map((line, index) => (
        <Text key={index} style={[styles.fromLine, { textAlign: align }]}>
          {t(line)}
        </Text>
      ))}
    </View>
  );
}

function DocumentBody({
  document: doc,
  branding,
}: {
  document: BusinessDocument;
  branding: Branding;
}) {
  const currency = getCurrency(doc.currency);
  const totals = computeDocumentTotals(doc);
  const money = (minor: number) => t(formatMoney(minor, currency));

  const paymentLines = [
    ["Terms", doc.payment.terms],
    ["Due date", doc.payment.dueDate],
    ["Method", doc.payment.method],
    ["Bank", doc.payment.bankName],
    ["Account name", doc.payment.accountName],
    ["Account number", doc.payment.accountNumber],
    ["IFSC / SWIFT", doc.payment.ifscSwift],
    ["UPI", doc.payment.upiId],
  ].filter(([, value]) => value && String(value).trim().length > 0);

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: "55%" }}>
          {branding.logo_data_url ? (
            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */
            <Image src={branding.logo_data_url} style={styles.logo} />
          ) : null}
          <Text style={styles.fromName}>
            {t(branding.business_name || doc.from.name)}
          </Text>
          {[doc.from.address, doc.from.phone, doc.from.email, doc.from.taxId]
            .filter((line) => line && line.trim())
            .map((line, index) => (
              <Text key={index} style={styles.fromLine}>
                {t(line)}
              </Text>
            ))}
        </View>

        <View style={{ width: "42%" }}>
          <Text style={styles.docType}>
            {DOCUMENT_KIND_LABELS[doc.kind].toUpperCase()}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Reference</Text>
            <Text style={styles.metaValue}>{t(doc.reference)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{t(doc.issueDate)}</Text>
          </View>
          {doc.payment.dueDate ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due</Text>
              <Text style={styles.metaValue}>{t(doc.payment.dueDate)}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Currency</Text>
            <Text style={styles.metaValue}>{currency.code}</Text>
          </View>
        </View>
      </View>

      {/* Recipient. The sender already appears in the header, so repeating it
          here as a "FROM" column would just be the same block twice. */}
      <View style={styles.partyBlock}>
        <PartyColumn label="BILL TO" party={doc.to} />
      </View>

      {doc.title ? <Text style={styles.title}>{t(doc.title)}</Text> : null}

      {/* Items */}
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: COLUMNS.index }]}>#</Text>
        <Text style={[styles.th, { width: COLUMNS.description }]}>Description</Text>
        <Text style={[styles.th, { width: COLUMNS.qty, textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.th, { width: COLUMNS.rate, textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.th, { width: COLUMNS.tax, textAlign: "right" }]}>Tax</Text>
        <Text style={[styles.th, { width: COLUMNS.amount, textAlign: "right" }]}>Amount</Text>
      </View>

      {doc.items.length === 0 ? (
        <View style={styles.tr}>
          <Text style={styles.td}>No line items.</Text>
        </View>
      ) : (
        doc.items.map((item, index) => {
          const lineTotals = totals.lines[index];
          return (
            <View key={item.id} style={styles.tr} wrap={false}>
              <Text style={[styles.td, { width: COLUMNS.index, color: C.faint }]}>
                {index + 1}
              </Text>
              <View style={{ width: COLUMNS.description }}>
                <Text style={styles.td}>{t(item.description)}</Text>
                {item.discountPct > 0 ? (
                  <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>
                    {`Discount ${item.discountPct}% (-${money(lineTotals.discountMinor)})`}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.td, { width: COLUMNS.qty, textAlign: "right" }]}>
                {item.quantity}
                {item.unit ? ` ${t(item.unit)}` : ""}
              </Text>
              <Text style={[styles.td, { width: COLUMNS.rate, textAlign: "right" }]}>
                {money(item.unitPriceMinor)}
              </Text>
              <Text style={[styles.td, { width: COLUMNS.tax, textAlign: "right" }]}>
                {lineTotals.effectiveTaxPct}%
              </Text>
              <Text style={[styles.td, { width: COLUMNS.amount, textAlign: "right" }]}>
                {money(lineTotals.netMinor)}
              </Text>
            </View>
          );
        })
      )}

      {/* Totals */}
      <View style={{ marginTop: 10 }} wrap={false}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{money(totals.subtotalMinor)}</Text>
        </View>
        {totals.totalDiscountMinor > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <Text style={styles.totalsValue}>
              -{money(totals.totalDiscountMinor)}
            </Text>
          </View>
        ) : null}
        {totals.taxBreakdown.map((band) => (
          <View key={band.pct} style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              {t(doc.taxLabel || "Tax")} @ {band.pct}%
            </Text>
            <Text style={styles.totalsValue}>{money(band.taxMinor)}</Text>
          </View>
        ))}
        {totals.shippingMinor !== 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Shipping</Text>
            <Text style={styles.totalsValue}>{money(totals.shippingMinor)}</Text>
          </View>
        ) : null}
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Total due</Text>
          <Text style={styles.grandValue}>{money(totals.grandTotalMinor)}</Text>
        </View>
      </View>

      {/* Payment */}
      {paymentLines.length > 0 ? (
        <View style={{ marginTop: 16 }} wrap={false}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <View style={styles.panel}>
            {paymentLines.map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={{ fontSize: 8.5, color: C.muted, width: 100 }}>
                  {label}
                </Text>
                <Text style={{ fontSize: 8.5, color: C.ink, flex: 1 }}>
                  {t(value)}
                </Text>
              </View>
            ))}
            {doc.payment.instructions ? (
              <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
                {t(doc.payment.instructions)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Notes */}
      {doc.notes ? (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.bodyText}>{t(doc.notes)}</Text>
        </View>
      ) : null}

      {/* Terms */}
      {doc.termsAndConditions ? (
        <View style={{ marginTop: 14 }} break={doc.items.length > 12}>
          <Text style={styles.sectionTitle}>Terms and conditions</Text>
          {doc.termsAndConditions.split(/\r?\n/).map((line, index) =>
            line.trim() ? (
              <Text key={index} style={[styles.bodyText, { marginBottom: 1.5 }]}>
                {t(line)}
              </Text>
            ) : null,
          )}
        </View>
      ) : null}

      {/* Signature */}
      {doc.showSignature &&
      (branding.signature_data_url || branding.signatory_name) ? (
        <View style={{ marginTop: 24, alignItems: "flex-end" }} wrap={false}>
          {branding.signature_data_url ? (
            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */
            <Image
              src={branding.signature_data_url}
              style={{ width: 120, height: 40, objectFit: "contain" }}
            />
          ) : null}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: C.ink,
              width: 180,
              paddingTop: 3,
              alignItems: "flex-end",
            }}
          >
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}>
              {t(branding.signatory_name || "Authorised signatory")}
            </Text>
            {branding.signatory_title ? (
              <Text style={{ fontSize: 8, color: C.muted }}>
                {t(branding.signatory_title)}
              </Text>
            ) : null}
            <Text style={{ fontSize: 8, color: C.muted }}>
              {t(branding.business_name || doc.from.name)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.footer} fixed>
        <Text>
          {t(DOCUMENT_KIND_LABELS[doc.kind])} {t(doc.reference)}
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

export async function renderDocumentPdf(
  document: BusinessDocument,
  branding: Branding,
): Promise<Buffer> {
  return renderToBuffer(
    <Document
      title={`${DOCUMENT_KIND_LABELS[document.kind]} ${document.reference}`}
      author={branding.business_name ?? document.from.name}
      creator="NEXORA AI"
    >
      <DocumentBody document={document} branding={branding} />
    </Document>,
  );
}
