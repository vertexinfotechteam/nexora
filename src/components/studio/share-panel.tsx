"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { formatMoney, getCurrency } from "@/lib/structure/money";
import { computeDocumentTotals } from "@/lib/documents/totals";
import { DOCUMENT_KIND_LABELS, type BusinessDocument } from "@/lib/documents/types";

/**
 * Share a document with the person who has to read it.
 *
 * A quotation is worth nothing until the client sees it, and the client has no
 * account here. So sharing produces an unguessable public link, and WhatsApp
 * and email carry that link with a message already written.
 *
 * The link is opt-in and revocable — nothing is public until the owner asks.
 */
export function SharePanel({
  document: doc,
  onDocumentChange,
}: {
  document: BusinessDocument;
  onDocumentChange: (changes: Partial<BusinessDocument>) => void;
}) {
  const [url, setUrl] = useState<string | null>(
    doc.shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/d/${doc.shareToken}` : null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const currency = getCurrency(doc.currency);
  const totals = computeDocumentTotals(doc);
  const total = formatMoney(totals.grandTotalMinor, currency);
  const kindLabel = DOCUMENT_KIND_LABELS[doc.kind];
  const senderName = doc.from.name || "us";

  const message = url
    ? `${doc.to.name ? `Hello ${doc.to.name},` : "Hello,"}

Please find your ${kindLabel.toLowerCase()} ${doc.reference} from ${senderName}.

Total: ${total}${doc.payment.dueDate ? `\nPayment due: ${doc.payment.dueDate}` : ""}

You can view and download it here (PDF and Excel):
${url}

Thank you,
${senderName}`
    : "";

  const createLink = async () => {
    setBusy(true);
    try {
      // Save first, so the link serves what is on screen rather than the last save.
      const saved = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: doc }),
      });
      if (!saved.ok) {
        const body = await saved.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save before sharing.");
      }

      const response = await fetch(`/api/documents/${doc.id}/share`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the link.");

      setUrl(data.url);
      onDocumentChange({ shareToken: data.token });
      toast.success("Share link ready.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!confirm("Revoke this link? Anyone who already has it will lose access.")) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/documents/${doc.id}/share`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not revoke the link.");
      setUrl(null);
      onDocumentChange({ shareToken: null });
      toast.success("Link revoked.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const whatsapp = () => {
    const phone = doc.to.phone.replace(/[^\d]/g, "");
    const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };

  const email = () => {
    const params = new URLSearchParams({
      subject: `${kindLabel} ${doc.reference} from ${senderName}`,
      body: message,
    });
    window.location.href = `mailto:${doc.to.email}?${params.toString().replace(/\+/g, "%20")}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link2 className="h-3.5 w-3.5 text-[var(--nx-purple)]" />
          Send to your client
        </CardTitle>
        {doc.shareViewCount ? (
          <span className="text-[10.5px] text-[var(--nx-text-faint)]">
            opened {doc.shareViewCount}×
          </span>
        ) : null}
      </CardHeader>

      <CardBody className="space-y-3 p-3">
        {!url ? (
          <>
            <p className="text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
              Create a private link your client can open without an account. They
              see the {kindLabel.toLowerCase()} with your logo and signature, and
              can download it as PDF or Excel.
            </p>
            <Button
              variant="primary"
              className="w-full"
              onClick={createLink}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Create share link
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="h-8 flex-1 rounded border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2 font-mono text-[11px] text-[var(--nx-text-muted)] outline-none"
              />
              <Button size="icon-sm" variant="secondary" onClick={copy} title="Copy link">
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--nx-success)]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="secondary" onClick={whatsapp}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button variant="secondary" onClick={email}>
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--nx-text-muted)]">
              {doc.to.phone || doc.to.email
                ? "Opens with your client's details and the message already written."
                : "Add your client's phone and email under From & to and these will be pre-addressed."}
            </p>

            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="flex items-center gap-1.5 text-[11px] text-[var(--nx-text-faint)] transition-colors hover:text-[var(--nx-error)]"
            >
              <ShieldOff className="h-3 w-3" />
              Revoke this link
            </button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
