import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getDocument } from "@/lib/documents/store";
import { getBranding } from "@/lib/branding";
import { audit } from "@/lib/store";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { enforceLimit } from "@/lib/security/guard";
import { isUuid } from "@/lib/security/validate";

export const maxDuration = 120;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/documents/[id]/pdf">,
) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("export");
  if (limited) return limited;

  let session;
  try {
    session = await requireSession();
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const { id } = await context.params;
  // The path segment is untrusted. Without this the id reaches Postgres, the
  // uuid cast throws, and the route answers 500 instead of 404.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const document = await getDocument(session, id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const branding = await getBranding(session);
    const pdf = await renderDocumentPdf(document, branding);

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "document.exported",
      resource_type: "document",
      resource_id: document.id,
      metadata: { format: "pdf", kind: document.kind },
    });

    const name = `${DOCUMENT_KIND_LABELS[document.kind]}-${document.reference}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(pdf.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[document] PDF failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The PDF could not be generated: ${error.message}`
            : "The PDF could not be generated.",
      },
      { status: 500 },
    );
  }
}
