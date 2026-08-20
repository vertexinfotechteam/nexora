import { NextResponse, type NextRequest } from "next/server";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import {
  audit,
  createDataset,
  createDatasetFile,
  replaceDatasetColumns,
  replaceDatasetProfiles,
  updateDataset,
} from "@/lib/store";
import { getObject, sanitizeFileName, buildStoragePath } from "@/lib/storage";
import { sha256 } from "@/lib/storage";
import { checkFileSignature, detectFileKind, IngestError } from "@/lib/ingest/source";
import { ensureDatasetLoaded } from "@/lib/ingest/loader";
import { profileDataset } from "@/lib/ingest/profile";
import { boundedString, isUuid } from "@/lib/security/validate";
import { enforceLimit } from "@/lib/security/guard";
import { consumeCredit, getCreditBalance } from "@/lib/credits";

export const maxDuration = 300;

/**
 * Registers and profiles a file that is already in storage.
 *
 * The second half of the direct-upload flow: /upload-url issues a signed URL,
 * the browser sends the file straight to storage, then this route reads it
 * back and runs the same pipeline the old single-request upload did —
 * signature check, metadata, engine load, profile, quality score.
 *
 * The client supplies a storage path, so it is rebuilt here from the session
 * rather than trusted. A caller cannot name someone else's path and have this
 * route ingest it: the organization and user segments come from the session,
 * and anything that does not match what those produce is refused.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceLimit("upload");
  if (limited) return limited;

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as {
    datasetId?: unknown;
    storagePath?: unknown;
    fileName?: unknown;
    name?: unknown;
    sizeBytes?: unknown;
  };

  const rawFileName = boundedString(body.fileName, 255);
  const claimedPath = boundedString(body.storagePath, 1024);
  const sizeBytes = Number(body.sizeBytes);

  if (!isUuid(body.datasetId) || !rawFileName || !claimedPath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const datasetId = body.datasetId;
  const fileName = sanitizeFileName(rawFileName);

  /*
   * The only path this route will touch is the one the session implies.
   *
   * Comparing against a rebuilt path rather than validating the supplied one
   * means there is no pattern to get wrong — a path belonging to another
   * workspace simply cannot be produced from this session's identifiers.
   */
  const expectedPath = buildStoragePath({
    organizationId: session.organizationId,
    userId: session.userId,
    datasetId,
    fileName,
  });

  if (claimedPath !== expectedPath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const balance = await getCreditBalance(session);
  if (balance.remaining <= 0) {
    return NextResponse.json(
      {
        error: "Your credits for this period are used up, so this file was not imported.",
        hint: "Everything you have already uploaded stays available to read, analyse and download.",
      },
      { status: 402 },
    );
  }

  let createdId: string | null = null;

  try {
    const buffer = await getObject(expectedPath);

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "The uploaded file is empty." },
        { status: 400 },
      );
    }

    const kind = detectFileKind(fileName);
    checkFileSignature(buffer, kind);

    const providedName = boundedString(body.name, 120);
    const dataset = await createDataset(session, {
      name: providedName || fileName.replace(/\.[^.]+$/, ""),
      description: null,
      file_type: kind,
      size_bytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : buffer.length,
    });
    createdId = dataset.id;

    const datasetFile = await createDatasetFile(session, {
      dataset_id: dataset.id,
      storage_path: expectedPath,
      original_name: fileName,
      mime_type: null,
      size_bytes: buffer.length,
      checksum_sha256: sha256(buffer),
      scan_status: "clean",
      scan_detail: "Extension, size and content signature verified.",
    });

    await updateDataset(session, dataset.id, { status: "profiling" });

    const engineKey = await ensureDatasetLoaded(dataset, datasetFile);
    const profile = await profileDataset(engineKey);

    await replaceDatasetColumns(session, dataset.id, profile.columns);
    await replaceDatasetProfiles(session, dataset.id, profile.profiles);
    await updateDataset(session, dataset.id, {
      status: "ready",
      row_count: profile.quality.rowCount,
      column_count: profile.quality.columnCount,
      quality_score: profile.quality.score,
    });

    /*
     * Charged only now that the file is loaded, profiled and readable — an
     * import that failed on a corrupt file must never cost a credit.
     */
    const after = await consumeCredit(
      session,
      { datasetId: dataset.id, rows: profile.quality.rowCount, bytes: buffer.length },
      "dataset_import",
    );

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "dataset.uploaded",
      resource_type: "dataset",
      resource_id: dataset.id,
      metadata: {
        rows: profile.quality.rowCount,
        columns: profile.quality.columnCount,
        bytes: buffer.length,
        quality: profile.quality.score,
        via: "direct",
      },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });

    // Same shape the single-request upload returned, so the client renders
    // the identical success message whichever path a file took.
    return NextResponse.json({
      dataset,
      quality: profile.quality,
      credits: { used: after.used, limit: after.limit, remaining: after.remaining },
    });
  } catch (error) {
    // A dataset row already exists by this point, so it is marked failed with
    // the reason rather than left looking like it is still profiling.
    if (createdId) {
      await updateDataset(session, createdId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Ingest failed.",
      }).catch(() => {});
    }

    if (error instanceof IngestError) {
      return NextResponse.json(
        { error: error.message, hint: error.hint },
        { status: 400 },
      );
    }

    console.error("[ingest] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The file could not be read." },
      { status: 500 },
    );
  }
}
