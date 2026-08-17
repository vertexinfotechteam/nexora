import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getDataset, getDatasetFile } from "@/lib/store";
import { ensureDatasetLoaded, previewRows } from "@/lib/ingest/loader";
import { enforceLimit } from "@/lib/security/guard";
import { isUuid } from "@/lib/security/validate";

/**
 * Paginated dataset preview. Bounded server-side so a large table can never be
 * pulled into the browser in one request.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/datasets/[id]/preview">,
) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("read");
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

  const dataset = await getDataset(session, id);
  const file = await getDatasetFile(session, id);
  if (!dataset || !file) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25) || 25));

  try {
    const engineKey = await ensureDatasetLoaded(dataset, file);
    const { columns, rows } = await previewRows(engineKey, offset, limit);
    return NextResponse.json({
      columns,
      rows,
      offset,
      limit,
      total: dataset.row_count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The preview could not be loaded.",
      },
      { status: 500 },
    );
  }
}
