import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileSpreadsheet, Sparkles } from "lucide-react";
import { getSharedDocument, noteShareView } from "@/lib/documents/share";
import { getBrandingForOrganization } from "@/lib/branding";
import { computeDocumentTotals } from "@/lib/documents/totals";
import { formatMoney, getCurrency } from "@/lib/structure/money";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";
import { COMPANY } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared document",
  robots: { index: false, follow: false },
};

/**
 * Public read-only view of a shared document.
 *
 * The recipient has no account, so this page has to stand on its own: who sent
 * it, what it is for, what it totals, and how to pay — plus both downloads.
 * Nothing here links into the app.
 */
export default async function SharedDocumentPage(
  props: PageProps<"/d/[token]">,
) {
  const { token } = await props.params;
  const document = await getSharedDocument(token);
  if (!document) notFound();

  const branding = await getBrandingForOrganization(document.organization_id);
  const currency = getCurrency(document.currency);
  const totals = computeDocumentTotals(document);
  const money = (minor: number) => formatMoney(minor, currency);
  const kindLabel = DOCUMENT_KIND_LABELS[document.kind];
  const senderName = branding.business_name || document.from.name;

  // Fire-and-forget: a failed view counter must never break the page.
  void noteShareView(document).catch(() => undefined);

  return (
    <div className="min-h-screen bg-[var(--nx-bg)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Sender */}
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding.logo_data_url ? (
              /* eslint-disable-next-line @next/next/no-img-element -- a data URI needs no optimisation */
              <img
                src={branding.logo_data_url}
                alt={`${senderName} logo`}
                className="h-12 w-auto max-w-[160px] object-contain"
              />
            ) : null}
            <div>
              <p className="text-[17px] font-semibold tracking-tight">
                {senderName}
              </p>
              {document.from.email ? (
                <p className="text-[12px] text-[var(--nx-text-muted)]">
                  {document.from.email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-[20px] font-semibold uppercase tracking-wide text-[var(--nx-purple)]">
              {kindLabel}
            </p>
            <p className="font-mono text-[12px] text-[var(--nx-text-muted)]">
              {document.reference}
            </p>
            <p className="text-[12px] text-[var(--nx-text-muted)]">
              {document.issueDate}
            </p>
          </div>
        </header>

        {/* Total + downloads */}
        <section className="mb-4 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 shadow-[var(--nx-shadow)]">
          {document.to.name ? (
            <p className="mb-1 text-[12px] text-[var(--nx-text-muted)]">
              Prepared for
            </p>
          ) : null}
          {document.to.name ? (
            <p className="mb-4 text-[15px] font-semibold">{document.to.name}</p>
          ) : null}

          <p className="text-[12px] text-[var(--nx-text-muted)]">Total due</p>
          <p className="text-[32px] font-semibold leading-none tracking-tight text-[var(--nx-purple)]">
            {money(totals.grandTotalMinor)}
          </p>
          {document.payment.dueDate ? (
            <p className="mt-1.5 text-[12.5px] text-[var(--nx-text-muted)]">
              Payment due {document.payment.dueDate}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/api/shared/${token}/pdf`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--nx-purple)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--nx-purple-hover)]"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
            <a
              href={`/api/shared/${token}/excel`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-card)] px-4 text-[13.5px] font-semibold transition-colors hover:bg-[var(--nx-elevated)]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel
            </a>
          </div>
        </section>

        {/* Items */}
        <section className="mb-4 overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)]">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[var(--nx-inset)] text-[var(--nx-text-muted)]">
                <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {document.items.map((item, index) => (
                <tr key={item.id} className="border-t border-[var(--nx-border-subtle)]">
                  <td className="px-4 py-2.5">{item.description}</td>
                  <td className="px-3 py-2.5 text-right">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {money(item.unitPriceMinor)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {money(totals.lines[index].netMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-[var(--nx-border)] px-4 py-3">
            <Row label="Subtotal" value={money(totals.subtotalMinor)} />
            {totals.totalDiscountMinor > 0 ? (
              <Row label="Discount" value={`-${money(totals.totalDiscountMinor)}`} />
            ) : null}
            {totals.taxBreakdown.map((band) => (
              <Row
                key={band.pct}
                label={`${document.taxLabel || "Tax"} @ ${band.pct}%`}
                value={money(band.taxMinor)}
              />
            ))}
            {totals.shippingMinor !== 0 ? (
              <Row label="Shipping" value={money(totals.shippingMinor)} />
            ) : null}
            <div className="flex justify-between border-t border-[var(--nx-text)] pt-2 text-[15px] font-semibold">
              <span>Total due</span>
              <span className="font-mono text-[var(--nx-purple)]">
                {money(totals.grandTotalMinor)}
              </span>
            </div>
          </div>
        </section>

        {/* Payment */}
        {document.payment.bankName || document.payment.upiId ? (
          <section className="mb-4 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5">
            <h2 className="mb-2 text-[13.5px] font-semibold">How to pay</h2>
            <dl className="space-y-1">
              {[
                ["Terms", document.payment.terms],
                ["Method", document.payment.method],
                ["Bank", document.payment.bankName],
                ["Account name", document.payment.accountName],
                ["Account number", document.payment.accountNumber],
                ["IFSC / SWIFT", document.payment.ifscSwift],
                ["UPI", document.payment.upiId],
              ]
                .filter(([, value]) => value && String(value).trim())
                .map(([label, value]) => (
                  <div key={label} className="flex gap-3 text-[12.5px]">
                    <dt className="w-32 shrink-0 text-[var(--nx-text-muted)]">
                      {label}
                    </dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {document.payment.instructions ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                {document.payment.instructions}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Terms */}
        {document.termsAndConditions ? (
          <section className="mb-4 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5">
            <h2 className="mb-2 text-[13.5px] font-semibold">
              Terms and conditions
            </h2>
            {document.termsAndConditions
              .split(/\r?\n/)
              .filter((line) => line.trim())
              .map((line, index) => (
                <p
                  key={index}
                  className="text-[12px] leading-relaxed text-[var(--nx-text-muted)]"
                >
                  {line}
                </p>
              ))}
          </section>
        ) : null}

        {/* Signature */}
        {document.showSignature &&
        (branding.signature_data_url || branding.signatory_name) ? (
          <section className="mb-4 flex flex-col items-end rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5">
            {branding.signature_data_url ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data URI */
              <img
                src={branding.signature_data_url}
                alt="Authorised signature"
                className="mb-1 h-12 w-auto max-w-[180px] object-contain"
              />
            ) : null}
            <div className="border-t border-[var(--nx-text)] pt-1.5 text-right">
              <p className="text-[13px] font-semibold">
                {branding.signatory_name || "Authorised signatory"}
              </p>
              {branding.signatory_title ? (
                <p className="text-[11.5px] text-[var(--nx-text-muted)]">
                  {branding.signatory_title}
                </p>
              ) : null}
              <p className="text-[11.5px] text-[var(--nx-text-muted)]">
                {senderName}
              </p>
            </div>
          </section>
        ) : null}

        {/* Our name, on every shared document. */}
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--nx-border)] pt-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[11.5px] text-[var(--nx-text-muted)] transition-colors hover:text-[var(--nx-text)]"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[var(--nx-purple)] to-[var(--nx-accent)]">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </span>
            Prepared with <strong className="font-semibold">{COMPANY.product}</strong> by{" "}
            {COMPANY.name}
          </Link>
          <p className="text-[11px] text-[var(--nx-text-faint)]">
            Every figure computed from the sender&apos;s own data.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12.5px]">
      <span className="text-[var(--nx-text-muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
