import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { deleteLocal, findLocal, insertLocal, updateLocal } from "@/lib/store/local";
import { storeMode } from "@/lib/store";
import type { Session } from "@/lib/store/types";
import {
  DEFAULT_TERMS,
  emptyParty,
  emptyPayment,
  type BusinessDocument,
  type DocumentKind,
} from "./types";

const COLLECTION = "documents";

/** Reference like QT-2026-4F2A — short, unique enough, and readable aloud. */
function buildReference(kind: DocumentKind): string {
  const prefix =
    kind === "invoice" ? "INV" : kind === "receipt" ? "RCP" : kind === "estimate" ? "EST" : "QT";
  const year = new Date().getUTCFullYear();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}-${year}-${suffix}`;
}

export function newDocument(
  session: Session,
  overrides: Partial<BusinessDocument> = {},
): BusinessDocument {
  const kind = overrides.kind ?? "quotation";
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    organization_id: session.organizationId,
    created_by: session.userId,
    kind,
    reference: buildReference(kind),
    title: "",
    issueDate: now.slice(0, 10),
    currency: "INR",
    from: { ...emptyParty(), name: session.organizationName },
    to: emptyParty(),
    items: [],
    taxPct: 18,
    taxLabel: "GST",
    discountPct: 0,
    shippingMinor: 0,
    notes: "",
    termsAndConditions: DEFAULT_TERMS,
    payment: emptyPayment(),
    showSignature: true,
    sourceText: "",
    structuredBy: "",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export async function saveDocument(
  session: Session,
  document: BusinessDocument,
): Promise<BusinessDocument> {
  const next: BusinessDocument = {
    ...document,
    organization_id: session.organizationId,
    updated_at: new Date().toISOString(),
  };

  if (storeMode() === "local" || !hasServiceClient()) {
    const existing = await findLocal<BusinessDocument>(
      COLLECTION,
      (row) => row.id === next.id,
    );
    if (existing.length > 0) {
      await updateLocal<BusinessDocument>(COLLECTION, next.id, next);
    } else {
      await insertLocal<BusinessDocument>(COLLECTION, next);
    }
    return next;
  }

  const { error } = await getServiceClient()
    .from("business_documents")
    .upsert({
      id: next.id,
      organization_id: next.organization_id,
      created_by: next.created_by,
      kind: next.kind,
      reference: next.reference,
      title: next.title,
      issue_date: next.issueDate,
      currency: next.currency,
      // The editable body travels as one JSON column: it is a document, not a
      // reporting table, and nothing queries inside it.
      payload: next,
      created_at: next.created_at,
      updated_at: next.updated_at,
    });
  if (error) throw new Error(`Could not save document: ${error.message}`);
  return next;
}

export async function getDocument(
  session: Session,
  id: string,
): Promise<BusinessDocument | null> {
  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<BusinessDocument>(
      COLLECTION,
      (row) => row.id === id && row.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }

  const { data } = await getServiceClient()
    .from("business_documents")
    .select("payload")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  return (data?.payload as BusinessDocument) ?? null;
}

export async function listDocuments(
  session: Session,
  limit = 100,
): Promise<BusinessDocument[]> {
  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<BusinessDocument>(
      COLLECTION,
      (row) => row.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
  }

  const { data } = await getServiceClient()
    .from("business_documents")
    .select("payload")
    .eq("organization_id", session.organizationId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => row.payload as BusinessDocument);
}

export async function deleteDocument(
  session: Session,
  id: string,
): Promise<void> {
  if (storeMode() === "local" || !hasServiceClient()) {
    await deleteLocal(COLLECTION, (row) => row.id === id);
    return;
  }
  await getServiceClient()
    .from("business_documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);
}
