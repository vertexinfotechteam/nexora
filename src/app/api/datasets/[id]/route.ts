import { NextResponse, type NextRequest } from "next/server";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import { audit, deleteDataset, getDataset, getDatasetFile } from "@/lib/store";
import { clearMaterialized, deleteObject } from "@/lib/storage";
import { closeEngine } from "@/lib/duckdb/engine";
import { engineKeyFor } from "@/lib/ingest/loader";

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/datasets/[id]">,
) {
  let session;
  try {
    session = await requireSession();
    assertCanWrite(session);
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const { id } = await context.params;
  const dataset = await getDataset(session, id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const file = await getDatasetFile(session, id);

  // Release the loaded engine and cached copy before the records go.
  closeEngine(engineKeyFor(session.organizationId, id));
  await clearMaterialized(id);
  if (file) await deleteObject(file.storage_path).catch(() => undefined);
  await deleteDataset(session, id);

  await audit({
    organization_id: session.organizationId,
    user_id: session.userId,
    action: "dataset.deleted",
    resource_type: "dataset",
    resource_id: id,
    metadata: { name: dataset.name },
  });

  return NextResponse.json({ ok: true });
}
