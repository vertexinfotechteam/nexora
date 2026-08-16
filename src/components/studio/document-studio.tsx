"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  GripVertical,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { SharePanel } from "./share-panel";
import { computeDocumentTotals } from "@/lib/documents/totals";
import { formatMoney, fromMinor, getCurrency, toMinor } from "@/lib/structure/money";
import {
  DOCUMENT_KIND_LABELS,
  type BusinessDocument,
  type DocumentKind,
  type LineItem,
} from "@/lib/documents/types";
import { cn } from "@/lib/utils";

/**
 * The document studio.
 *
 * Left: paste raw text, structure it, then edit every line. Right: a live
 * summary. Everything below the items — notes, terms, payment details — is
 * free text the user owns.
 *
 * Totals are computed by the shared engine on every keystroke, so what is on
 * screen is exactly what the PDF and the workbook will contain.
 */

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "JPY"];

const SAMPLE = `Brand identity design - 125000
Website redesign, 1, 245000
2x Landing page 45000
Social media kit: 35000
Monthly retainer x 6 30000`;

type Tab = "items" | "parties" | "terms" | "payment";

export function DocumentStudio({ initial }: { initial: BusinessDocument }) {
  const router = useRouter();
  const [doc, setDoc] = useState<BusinessDocument>(initial);
  const [raw, setRaw] = useState(initial.sourceText);
  const [tab, setTab] = useState<Tab>("items");
  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const currency = getCurrency(doc.currency);
  const totals = useMemo(() => computeDocumentTotals(doc), [doc]);
  const money = (minor: number) => formatMoney(minor, currency);

  const patch = useCallback((changes: Partial<BusinessDocument>) => {
    setDoc((previous) => ({ ...previous, ...changes }));
  }, []);

  const patchItem = useCallback((id: string, changes: Partial<LineItem>) => {
    setDoc((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    }));
  }, []);

  /* ---------------------------------------------------------------- */

  const structure = async () => {
    if (!raw.trim() || structuring) return;
    setStructuring(true);
    setRejected([]);
    try {
      const response = await fetch("/api/structure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw, currency: doc.currency }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not structure the text.");

      setDoc((previous) => ({
        ...previous,
        items: data.items,
        sourceText: raw,
        structuredBy: data.method,
      }));
      setRejected(data.rejectedAmounts ?? []);
      setTab("items");

      toast.success(
        `${data.items.length} line item${data.items.length === 1 ? "" : "s"} created. Check them before sending.`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStructuring(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: doc }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      setDoc(data.document);
      toast.success("Saved.");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const exportAs = async (format: "pdf" | "excel") => {
    setExporting(format);
    try {
      // Save first: the export renders from the stored document, so an unsaved
      // edit would silently not appear in the file.
      const saveResponse = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: doc }),
      });
      if (!saveResponse.ok) {
        const body = await saveResponse.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save before exporting.");
      }

      const response = await fetch(`/api/documents/${doc.id}/${format}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${DOCUMENT_KIND_LABELS[doc.kind]}-${doc.reference}.${
        format === "pdf" ? "pdf" : "xlsx"
      }`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const addItem = () => {
    setDoc((previous) => ({
      ...previous,
      items: [
        ...previous.items,
        {
          id: crypto.randomUUID(),
          description: "",
          unit: "",
          quantity: 1,
          unitPriceMinor: 0,
          discountPct: 0,
          taxPct: null,
        },
      ],
    }));
  };

  const removeItem = (id: string) => {
    setDoc((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.id !== id),
    }));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setDoc((previous) => {
      const next = [...previous.items];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...previous, items: next };
    });
  };

  /* ---------------------------------------------------------------- */

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {/* Raw input */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Wand2 className="h-3.5 w-3.5 text-[var(--nx-purple)]" />
              Paste your raw data
            </CardTitle>
            <button
              type="button"
              onClick={() => setRaw(SAMPLE)}
              className="text-[11px] text-[var(--nx-purple)] hover:underline"
            >
              Use an example
            </button>
          </CardHeader>
          <CardBody className="p-3">
            <textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={5}
              placeholder={
                "Paste anything — a list, an email, notes from a call.\n\nLogo design - 15000\n2x Landing page 45000\nRetainer, 6, 30000"
              }
              className="w-full resize-y rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={structure}
                disabled={!raw.trim() || structuring}
              >
                {structuring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {structuring ? "Structuring…" : "Structure into line items"}
              </Button>
              <p className="text-[11px] text-[var(--nx-text-muted)]">
                Free — this uses no analysis credits.
              </p>
            </div>

            {doc.structuredBy ? (
              <p className="mt-2 flex items-start gap-1.5 rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--nx-text-muted)]">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
                {doc.structuredBy}
              </p>
            ) : null}

            {rejected.length > 0 ? (
              <div className="mt-2 rounded border border-[var(--nx-accent-border)] bg-[var(--nx-accent-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--nx-accent-fg-on-soft)]">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {rejected.length} price{rejected.length === 1 ? "" : "s"} rejected
                </p>
                <p className="mt-1">
                  These figures were not found anywhere in your pasted text, so
                  they were left blank rather than guessed: {rejected.join("; ")}.
                  Fill them in yourself below.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["items", "Line items"],
              ["parties", "From & to"],
              ["terms", "Notes & terms"],
              ["payment", "Payment"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                tab === value
                  ? "bg-[var(--nx-purple)] text-white"
                  : "bg-[var(--nx-elevated)] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]",
              )}
            >
              {label}
              {value === "items" && doc.items.length > 0 ? ` (${doc.items.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "items" ? (
          <ItemsTab
            doc={doc}
            totals={totals}
            money={money}
            currency={currency.code}
            patch={patch}
            patchItem={patchItem}
            addItem={addItem}
            removeItem={removeItem}
            moveItem={moveItem}
          />
        ) : null}

        {tab === "parties" ? <PartiesTab doc={doc} patch={patch} /> : null}
        {tab === "terms" ? <TermsTab doc={doc} patch={patch} /> : null}
        {tab === "payment" ? <PaymentTab doc={doc} patch={patch} /> : null}
      </div>

      {/* Summary rail */}
      <div className="min-w-0 space-y-3">
        <Card className="xl:sticky xl:top-[58px]">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <Badge tone="purple">{DOCUMENT_KIND_LABELS[doc.kind]}</Badge>
          </CardHeader>
          <CardBody className="space-y-1.5 p-3">
            <SummaryRow label="Subtotal" value={money(totals.subtotalMinor)} />
            {totals.totalDiscountMinor > 0 ? (
              <SummaryRow
                label="Discount"
                value={`-${money(totals.totalDiscountMinor)}`}
              />
            ) : null}
            {totals.taxBreakdown.map((band) => (
              <SummaryRow
                key={band.pct}
                label={`${doc.taxLabel || "Tax"} @ ${band.pct}%`}
                value={money(band.taxMinor)}
              />
            ))}
            {totals.shippingMinor !== 0 ? (
              <SummaryRow label="Shipping" value={money(totals.shippingMinor)} />
            ) : null}

            <div className="mt-2 flex items-baseline justify-between border-t-2 border-[var(--nx-text)] pt-2">
              <span className="text-[12.5px] font-semibold">Total due</span>
              <span className="font-mono text-[17px] font-semibold tracking-tight text-[var(--nx-purple)]">
                {money(totals.grandTotalMinor)}
              </span>
            </div>

            <p className="pt-1 text-[10.5px] leading-relaxed text-[var(--nx-text-faint)]">
              Computed in whole {currency.code === "JPY" ? "yen" : "paise/cents"}{" "}
              from your line items — never rounded floating point.
            </p>

            <div className="grid gap-1.5 pt-2">
              <Button variant="secondary" onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="primary"
                  onClick={() => exportAs("pdf")}
                  disabled={exporting !== null}
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportAs("excel")}
                  disabled={exporting !== null}
                >
                  {exporting === "excel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Excel
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <SharePanel document={doc} onDocumentChange={patch} />
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-[var(--nx-text-muted)]">{label}</span>
      <span className="font-mono text-[12px]">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const inputClass =
  "h-8 w-full rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2 text-[12.5px] text-[var(--nx-text)] outline-none focus:border-[var(--nx-purple)]";

function ItemsTab({
  doc,
  totals,
  money,
  currency,
  patch,
  patchItem,
  addItem,
  removeItem,
  moveItem,
}: {
  doc: BusinessDocument;
  totals: ReturnType<typeof computeDocumentTotals>;
  money: (minor: number) => string;
  currency: string;
  patch: (changes: Partial<BusinessDocument>) => void;
  patchItem: (id: string, changes: Partial<LineItem>) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
  moveItem: (index: number, direction: -1 | 1) => void;
}) {
  const currencyObject = getCurrency(currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line items</CardTitle>
        <Button size="sm" variant="secondary" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </Button>
      </CardHeader>
      <CardBody className="p-0">
        {doc.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-[var(--nx-text-muted)]">
            No line items yet. Paste your raw data above and structure it, or add
            a row by hand.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[var(--nx-text-muted)]">
                  {["", "Description", "Unit", "Qty", "Rate", "Disc %", "Tax %", "Amount", ""].map(
                    (header, index) => (
                      <th
                        key={index}
                        className="whitespace-nowrap border-b border-[var(--nx-border)] px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item, index) => {
                  const lineTotals = totals.lines[index];
                  return (
                    <tr key={item.id} className="hover:bg-[var(--nx-hover)]">
                      <td className="border-b border-[var(--nx-border-subtle)] px-1 py-1.5">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                            className="text-[var(--nx-text-faint)] hover:text-[var(--nx-text)] disabled:opacity-30"
                          >
                            <GripVertical className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          value={item.description}
                          onChange={(event) =>
                            patchItem(item.id, { description: event.target.value })
                          }
                          placeholder="What is being charged for"
                          className={cn(inputClass, "min-w-[200px]")}
                        />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          value={item.unit}
                          onChange={(event) =>
                            patchItem(item.id, { unit: event.target.value })
                          }
                          placeholder="hrs"
                          className={cn(inputClass, "w-16")}
                        />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.quantity}
                          onChange={(event) =>
                            patchItem(item.id, {
                              quantity: Number(event.target.value),
                            })
                          }
                          className={cn(inputClass, "w-16 text-right")}
                        />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={fromMinor(item.unitPriceMinor, currencyObject)}
                          onChange={(event) =>
                            patchItem(item.id, {
                              unitPriceMinor: toMinor(
                                Number(event.target.value),
                                currencyObject,
                              ),
                            })
                          }
                          className={cn(inputClass, "w-24 text-right")}
                        />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.discountPct}
                          onChange={(event) =>
                            patchItem(item.id, {
                              discountPct: Number(event.target.value),
                            })
                          }
                          className={cn(inputClass, "w-16 text-right")}
                        />
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.taxPct ?? ""}
                          placeholder={String(doc.taxPct)}
                          onChange={(event) =>
                            patchItem(item.id, {
                              taxPct:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                          className={cn(inputClass, "w-16 text-right")}
                        />
                      </td>
                      <td className="whitespace-nowrap border-b border-[var(--nx-border-subtle)] px-2 py-1.5 text-right font-mono">
                        {money(lineTotals.netMinor)}
                      </td>
                      <td className="border-b border-[var(--nx-border-subtle)] px-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove row"
                          className="text-[var(--nx-text-faint)] hover:text-[var(--nx-error)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Document-level controls */}
        <div className="grid gap-3 border-t border-[var(--nx-border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Labelled label="Currency">
            <select
              value={doc.currency}
              onChange={(event) => patch({ currency: event.target.value })}
              className={inputClass}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Tax label">
            <input
              value={doc.taxLabel}
              onChange={(event) => patch({ taxLabel: event.target.value })}
              placeholder="GST"
              className={inputClass}
            />
          </Labelled>
          <Labelled label="Default tax %">
            <input
              type="number"
              min={0}
              max={100}
              value={doc.taxPct}
              onChange={(event) => patch({ taxPct: Number(event.target.value) })}
              className={inputClass}
            />
          </Labelled>
          <Labelled label="Overall discount %">
            <input
              type="number"
              min={0}
              max={100}
              value={doc.discountPct}
              onChange={(event) =>
                patch({ discountPct: Number(event.target.value) })
              }
              className={inputClass}
            />
          </Labelled>
        </div>
      </CardBody>
    </Card>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--nx-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function PartiesTab({
  doc,
  patch,
}: {
  doc: BusinessDocument;
  patch: (changes: Partial<BusinessDocument>) => void;
}) {
  const field = (
    side: "from" | "to",
    key: keyof BusinessDocument["from"],
    label: string,
    placeholder = "",
  ) => (
    <Labelled label={label}>
      <input
        value={doc[side][key]}
        onChange={(event) =>
          patch({ [side]: { ...doc[side], [key]: event.target.value } } as Partial<BusinessDocument>)
        }
        placeholder={placeholder}
        className={inputClass}
      />
    </Labelled>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Document</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 p-3 sm:grid-cols-2">
          <Labelled label="Type">
            <select
              value={doc.kind}
              onChange={(event) =>
                patch({ kind: event.target.value as DocumentKind })
              }
              className={inputClass}
            >
              {Object.entries(DOCUMENT_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Reference">
            <input
              value={doc.reference}
              onChange={(event) => patch({ reference: event.target.value })}
              className={inputClass}
            />
          </Labelled>
          <Labelled label="Issue date">
            <input
              type="date"
              value={doc.issueDate}
              onChange={(event) => patch({ issueDate: event.target.value })}
              className={inputClass}
            />
          </Labelled>
          <Labelled label="Title">
            <input
              value={doc.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Brand identity project"
              className={inputClass}
            />
          </Labelled>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bill to</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 p-3 sm:grid-cols-2">
          {field("to", "name", "Client name", "Acme Retail Pvt Ltd")}
          {field("to", "email", "Email", "accounts@acme.com")}
          {field("to", "phone", "Phone")}
          {field("to", "taxId", "Tax ID / GSTIN")}
          <div className="sm:col-span-2">
            <Labelled label="Address">
              <textarea
                value={doc.to.address}
                onChange={(event) =>
                  patch({ to: { ...doc.to, address: event.target.value } })
                }
                rows={2}
                className={cn(inputClass, "h-auto py-1.5")}
              />
            </Labelled>
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>From</CardTitle>
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            your logo and signature come from Settings
          </span>
        </CardHeader>
        <CardBody className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {field("from", "name", "Business name")}
          {field("from", "email", "Email")}
          {field("from", "phone", "Phone")}
          {field("from", "taxId", "Tax ID / GSTIN")}
          <div className="sm:col-span-2 lg:col-span-4">
            <Labelled label="Address">
              <textarea
                value={doc.from.address}
                onChange={(event) =>
                  patch({ from: { ...doc.from, address: event.target.value } })
                }
                rows={2}
                className={cn(inputClass, "h-auto py-1.5")}
              />
            </Labelled>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function TermsTab({
  doc,
  patch,
}: {
  doc: BusinessDocument;
  patch: (changes: Partial<BusinessDocument>) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardBody className="p-3">
          <textarea
            value={doc.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            rows={10}
            placeholder="Anything the client should read first — scope assumptions, delivery dates, what is not included."
            className="w-full resize-y rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-text-faint)] focus:border-[var(--nx-purple)]"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms and conditions</CardTitle>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--nx-text-muted)]">
            <input
              type="checkbox"
              checked={doc.showSignature}
              onChange={(event) => patch({ showSignature: event.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--nx-purple)]"
            />
            Show signature
          </label>
        </CardHeader>
        <CardBody className="p-3">
          <textarea
            value={doc.termsAndConditions}
            onChange={(event) => patch({ termsAndConditions: event.target.value })}
            rows={10}
            className="w-full resize-y rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--nx-text)] outline-none focus:border-[var(--nx-purple)]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--nx-text-muted)]">
            One clause per line. These are your words — edit them freely.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function PaymentTab({
  doc,
  patch,
}: {
  doc: BusinessDocument;
  patch: (changes: Partial<BusinessDocument>) => void;
}) {
  const field = (
    key: keyof BusinessDocument["payment"],
    label: string,
    placeholder = "",
  ) => (
    <Labelled label={label}>
      <input
        value={doc.payment[key]}
        onChange={(event) =>
          patch({ payment: { ...doc.payment, [key]: event.target.value } })
        }
        placeholder={placeholder}
        className={inputClass}
      />
    </Labelled>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment details</CardTitle>
        <span className="text-[10.5px] text-[var(--nx-text-faint)]">
          printed on the document
        </span>
      </CardHeader>
      <CardBody className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("terms", "Payment terms", "50% advance, balance on delivery")}
        <Labelled label="Due date">
          <input
            type="date"
            value={doc.payment.dueDate}
            onChange={(event) =>
              patch({ payment: { ...doc.payment, dueDate: event.target.value } })
            }
            className={inputClass}
          />
        </Labelled>
        {field("method", "Method", "Bank transfer / UPI")}
        {field("bankName", "Bank name")}
        {field("accountName", "Account name")}
        {field("accountNumber", "Account number")}
        {field("ifscSwift", "IFSC / SWIFT")}
        {field("upiId", "UPI ID")}
        <Labelled label="Shipping / other charge">
          <input
            type="number"
            min={0}
            step="any"
            value={fromMinor(doc.shippingMinor, getCurrency(doc.currency))}
            onChange={(event) =>
              patch({
                shippingMinor: toMinor(
                  Number(event.target.value),
                  getCurrency(doc.currency),
                ),
              })
            }
            className={inputClass}
          />
        </Labelled>
        <div className="sm:col-span-2 lg:col-span-3">
          <Labelled label="Payment instructions">
            <textarea
              value={doc.payment.instructions}
              onChange={(event) =>
                patch({
                  payment: { ...doc.payment, instructions: event.target.value },
                })
              }
              rows={2}
              className={cn(inputClass, "h-auto py-1.5")}
            />
          </Labelled>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--nx-text-muted)] sm:col-span-2 lg:col-span-3">
          <Check className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
          These details are printed on the document for your client to pay
          against. NEXORA does not process payments and never sees a
          transaction.
        </p>
      </CardBody>
    </Card>
  );
}
