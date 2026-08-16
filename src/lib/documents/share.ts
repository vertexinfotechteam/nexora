import "server-only";

import { randomBytes } from "node:crypto";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { findLocal, updateLocal } from "@/lib/store/local";
import { storeMode } from "@/lib/store";
import { getDocument, saveDocument } from "./store";
import type { Session } from "@/lib/store/types";
import type { BusinessDocument } from "./types";

/**
 * Public share links for a document.
 *
 * A quotation is only useful once the client can see it, and a client does not
 * have an account. So a document can be given an unguessable token that serves
 * a read-only view plus the PDF and Excel downloads, with no sign-in.
 *
 * The token lives inside the document's own JSON payload rather than in a
 * separate table, which keeps this to one storage concept and needs no schema
 * change. It is 32 bytes of CSPRNG output — 256 bits, so it cannot be guessed
 * or enumerated.
 *
 * Sharing is always opt-in: no token exists until the owner asks for one, and
 * revoking removes it immediately.
 */

export type ShareInfo = {
  token: string;
  url: string;
};

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates a share token, or returns the existing one. */
export async function ensureShareToken(
  session: Session,
  documentId: string,
  origin: string,
): Promise<ShareInfo | null> {
  const document = await getDocument(session, documentId);
  if (!document) return null;

  const token = document.shareToken ?? newToken();
  if (!document.shareToken) {
    await saveDocument(session, { ...document, shareToken: token });
  }

  return { token, url: `${origin}/d/${token}` };
}

export async function revokeShareToken(
  session: Session,
  documentId: string,
): Promise<boolean> {
  const document = await getDocument(session, documentId);
  if (!document) return false;
  await saveDocument(session, { ...document, shareToken: null });
  return true;
}

/**
 * Resolves a public token to its document.
 *
 * Deliberately bypasses the session: the whole point is that the recipient has
 * no account. Possession of the token is the authorisation, which is why it
 * has to be long and random. Nothing else about the workspace is reachable
 * from here — only this one document.
 */
export async function getSharedDocument(
  token: string,
): Promise<BusinessDocument | null> {
  if (!token || token.length < 20) return null;

  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<BusinessDocument>(
      "documents",
      (row) => row.shareToken === token,
    );
    return rows[0] ?? null;
  }

  const { data } = await getServiceClient()
    .from("business_documents")
    .select("payload")
    .eq("payload->>shareToken", token)
    .limit(1)
    .maybeSingle();

  return (data?.payload as BusinessDocument) ?? null;
}

/** Records that a shared document was opened, for the owner's audit trail. */
export async function noteShareView(document: BusinessDocument): Promise<void> {
  if (storeMode() === "local" || !hasServiceClient()) {
    await updateLocal<BusinessDocument>("documents", document.id, {
      shareViewCount: (document.shareViewCount ?? 0) + 1,
      shareLastViewedAt: new Date().toISOString(),
    }).catch(() => undefined);
    return;
  }

  await getServiceClient()
    .from("business_documents")
    .update({
      payload: {
        ...document,
        shareViewCount: (document.shareViewCount ?? 0) + 1,
        shareLastViewedAt: new Date().toISOString(),
      },
    })
    .eq("id", document.id);
}

/* -------------------------------------------------------------------------- */
/* Share message composition                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The message text used for WhatsApp and email.
 *
 * Written to be sent as-is by a small business owner: it says what the document
 * is, what it totals, and where to open it. No marketing, no emoji clutter.
 */
export function buildShareMessage(input: {
  kindLabel: string;
  reference: string;
  businessName: string;
  clientName: string;
  total: string;
  url: string;
  dueDate?: string;
}): string {
  const greeting = input.clientName ? `Hello ${input.clientName},` : "Hello,";
  const due = input.dueDate ? `\nPayment due: ${input.dueDate}` : "";

  return `${greeting}

Please find your ${input.kindLabel.toLowerCase()} ${input.reference} from ${input.businessName}.

Total: ${input.total}${due}

You can view and download it here (PDF and Excel):
${input.url}

Thank you,
${input.businessName}`;
}

export function whatsappUrl(message: string, phone?: string): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  const text = encodeURIComponent(message);
  // wa.me with no number opens the contact picker, which is what most people want.
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function mailtoUrl(input: {
  to?: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({
    subject: input.subject,
    body: input.body,
  });
  return `mailto:${input.to ?? ""}?${params.toString().replace(/\+/g, "%20")}`;
}
