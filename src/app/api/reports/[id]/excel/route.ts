import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { audit, getReport } from "@/lib/store";
import { getBranding } from "@/lib/branding";
import { renderReportExcel } from "@/lib/report/excel";

export const maxDuration = 120;

/**
 * Excel export of a saved report. Same verified payload as the PDF, laid out
 * as a workbook with the underlying rows so the reader can pivot them.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/reports/[id]/excel">,
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
    const workbook = await renderReportExcel(
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
      metadata: { format: "xlsx", bytes: workbook.byteLength },
    });

    const fileName = `nexora-report-${report.id.slice(0, 8)}.xlsx`;
    return new Response(new Uint8Array(workbook), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-length": String(workbook.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[report] Excel generation failed", error);
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
