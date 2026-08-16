import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getBranding } from "@/lib/branding";
import { listDocuments, newDocument } from "@/lib/documents/store";
import { DocumentStudio } from "@/components/studio/document-studio";
import { Badge } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";

export const metadata: Metadata = { title: "Data Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage(props: PageProps<"/studio">) {
  const session = await requireSession();
  const params = await props.searchParams;
  const requestedId = typeof params.doc === "string" ? params.doc : null;

  const [documents, branding] = await Promise.all([
    listDocuments(session, 20),
    getBranding(session),
  ]);

  const existing = requestedId
    ? documents.find((document) => document.id === requestedId)
    : null;

  // A fresh document is pre-filled with the workspace's own details, so the
  // "From" block is never blank on a first export.
  const initial =
    existing ??
    newDocument(session, {
      from: {
        name: branding.business_name ?? session.organizationName,
        email: session.email ?? "",
        phone: "",
        address: "",
        taxId: "",
      },
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Data Studio</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Paste raw data, turn it into a document, edit everything, export as PDF
          or Excel.
        </p>
      </div>

      {documents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--nx-text-muted)]">Recent:</span>
          <Link
            href="/studio"
            className="rounded-full border border-[var(--nx-border)] px-2.5 py-1 text-[11.5px] text-[var(--nx-text-muted)] hover:border-[var(--nx-purple)] hover:text-[var(--nx-text)]"
          >
            + New
          </Link>
          {documents.slice(0, 6).map((document) => (
            <Link
              key={document.id}
              href={`/studio?doc=${document.id}`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                document.id === initial.id
                  ? "border-[var(--nx-purple)] bg-[var(--nx-purple-soft)] text-[var(--nx-purple-fg)]"
                  : "border-[var(--nx-border)] text-[var(--nx-text-muted)] hover:border-[var(--nx-purple)] hover:text-[var(--nx-text)]"
              }`}
            >
              <FileText className="h-3 w-3" />
              {document.reference}
              <span className="text-[var(--nx-text-faint)]">
                {relativeTime(document.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {!branding.logo_data_url ? (
        <p className="rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2 text-[11.5px] text-[var(--nx-text-muted)]">
          <Badge tone="neutral" className="mr-1.5">
            Tip
          </Badge>
          Add your logo and signature under{" "}
          <Link href="/settings" className="text-[var(--nx-purple)] hover:underline">
            Settings
          </Link>{" "}
          and every {DOCUMENT_KIND_LABELS.quotation.toLowerCase()} you export will
          carry them.
        </p>
      ) : null}

      <DocumentStudio key={initial.id} initial={initial} />
    </div>
  );
}
