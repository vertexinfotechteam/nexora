import { NextResponse, type NextRequest } from "next/server";
import { getSharedDocument } from "@/lib/documents/share";
import { getBrandingForOrganization } from "@/lib/branding";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { renderDocumentExcel } from "@/lib/documents/excel";
import { DOCUMENT_KIND_LABELS } from "@/lib/documents/types";
import { enforceLimit } from "@/lib/security/guard";
import { isExportFormat, isShareToken } from "@/lib/security/validate";

export const maxDuration = 120;

/**
 * Public download for a shared document.
 *
 * No session: possession of the 256-bit token is the authorisation. Only the
 * one document the token names is reachable.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/shared/[token]/[format]">,
) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("sharedLink");
  if (limited) return limited;

  const { token, format } = await context.params;

  /*
   * Both segments are checked for shape before anything is looked up.
   *
   * A token that could not have been issued — wrong alphabet, wrong length —
   * is refused without a database round trip, which is also what stops this
   * endpoint being a cheap way to probe for valid tokens.
   */
  if (!isShareToken(token) || !isExportFormat(format)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const document = await getSharedDocument(token);
  if (!document) {
    return NextResponse.json(
      { error: "This link is not valid or has been revoked." },
      { status: 404 },
    );
  }

  try {
    const branding = await getBrandingForOrganization(document.organization_id);
    const name = `${DOCUMENT_KIND_LABELS[document.kind]}-${document.reference}`;

    if (format === "pdf") {
      const pdf = await renderDocumentPdf(document, branding);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${name}.pdf"`,
          "cache-control": "private, no-store",
        },
      });
    }

    const workbook = await renderDocumentExcel(document, branding);
    return new Response(new Uint8Array(workbook), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}.xlsx"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[shared] export failed", error);
    return NextResponse.json(
      { error: "The file could not be generated." },
      { status: 500 },
    );
  }
}
