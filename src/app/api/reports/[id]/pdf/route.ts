import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { audit, getReport } from "@/lib/store";
import { renderReportPdf } from "@/lib/report/pdf";
import { getBranding } from "@/lib/branding";

export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/reports/[id]/pdf">,
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
  const report = await getReport(session, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  try {
    const branding = await getBranding(session);
    const pdf = await renderReportPdf(
      report.payload,
      branding,
      session.organizationName,
    );

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "report.exported",
      resource_type: "report",
      resource_id: report.id,
      metadata: { format: "pdf", bytes: pdf.byteLength },
    });

    const fileName = `nexora-report-${report.id.slice(0, 8)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-length": String(pdf.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[report] PDF generation failed", error);
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
