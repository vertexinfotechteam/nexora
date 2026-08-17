import { NextResponse, type NextRequest } from "next/server";
import { requireSession, SessionError } from "@/lib/auth/session";
import { audit, getDatasetFile } from "@/lib/store";
import { getObject } from "@/lib/storage";
import { enforceLimit } from "@/lib/security/guard";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/datasets/[id]/download">,
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
  // Scoped by organization inside the store, so this cannot reach another tenant.
  const file = await getDatasetFile(session, id);
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const buffer = await getObject(file.storage_path);

  await audit({
    organization_id: session.organizationId,
    user_id: session.userId,
    action: "dataset.downloaded",
    resource_type: "dataset",
    resource_id: id,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": file.mime_type || "application/octet-stream",
      "content-disposition": `attachment; filename="${file.original_name}"`,
      "content-length": String(buffer.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
