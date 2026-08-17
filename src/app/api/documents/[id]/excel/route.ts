import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getDocument } from "@/lib/documents/store";
import { getBranding } from "@/lib/branding";
import { audit } from "@/lib/store";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";
import { renderDocumentExcel } from "@/lib/documents/excel";
import { enforceLimit } from "@/lib/security/guard";

export const maxDuration = 120;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/documents/[id]/excel">,
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
  const document = await getDocument(session, id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const branding = await getBranding(session);
    const workbook = await renderDocumentExcel(document, branding);

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "document.exported",
      resource_type: "document",
      resource_id: document.id,
      metadata: { format: "xlsx", kind: document.kind },
    });

    const name = `${DOCUMENT_KIND_LABELS[document.kind]}-${document.reference}.xlsx`;
    return new Response(new Uint8Array(workbook), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(workbook.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[document] Excel failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The workbook could not be generated: ${error.message}`
            : "The workbook could not be generated.",
      },
      { status: 500 },
    );
  }
}
