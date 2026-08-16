import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getDocument } from "@/lib/documents/store";
import { getBranding } from "@/lib/branding";
import { audit } from "@/lib/store";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";
import { renderDocumentPdf } from "@/lib/documents/pdf";

export const maxDuration = 120;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/documents/[id]/pdf">,
) {
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
