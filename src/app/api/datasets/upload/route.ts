import { NextResponse, type NextRequest } from "next/server";
import { UPLOAD_LIMITS } from "@/lib/env";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import {
  audit,
  createDataset,
  createDatasetFile,
  replaceDatasetColumns,
  replaceDatasetProfiles,
  updateDataset,
} from "@/lib/store";
import {
  buildStoragePath,
  putObject,
  sanitizeFileName,
  sha256,
} from "@/lib/storage";
import { checkFileSignature, IngestError, validateUpload } from "@/lib/ingest/source";
import { ensureDatasetLoaded } from "@/lib/ingest/loader";
import { profileDataset } from "@/lib/ingest/profile";
import { closeEngine } from "@/lib/duckdb/engine";
import { engineKeyFor } from "@/lib/ingest/loader";

export const maxDuration = 300;

/**
 * Dataset upload.
 *
 *   validate -> signature check -> private storage -> metadata
 *            -> load into sealed engine -> profile -> quality score -> ready
 *
 * Every failure marks the dataset row as failed with the reason, so a broken
 * upload is visible in the UI rather than silently missing.
 */
export async function POST(request: NextRequest) {
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

  let datasetId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name);
    const kind = validateUpload(fileName, file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    checkFileSignature(buffer, kind);

    const providedName = String(formData.get("name") ?? "").trim();
    const dataset = await createDataset(session, {
      name: providedName || fileName.replace(/\.[^.]+$/, ""),
      description: null,
      file_type: kind,
      size_bytes: file.size,
    });
    datasetId = dataset.id;

    const storagePath = buildStoragePath({
      organizationId: session.organizationId,
      userId: session.userId,
      datasetId: dataset.id,
      fileName,
    });

    await putObject(storagePath, buffer, file.type || "application/octet-stream");

    const datasetFile = await createDatasetFile(session, {
      dataset_id: dataset.id,
      storage_path: storagePath,
      original_name: fileName,
      mime_type: file.type || null,
      size_bytes: file.size,
      checksum_sha256: sha256(buffer),
      // The signature check above is the file-safety gate. It is recorded here
      // so an external scanner can be substituted without changing callers.
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

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "dataset.uploaded",
      resource_type: "dataset",
      resource_id: dataset.id,
      metadata: {
        rows: profile.quality.rowCount,
        columns: profile.quality.columnCount,
        bytes: file.size,
        quality: profile.quality.score,
      },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({
      dataset: {
        ...dataset,
        status: "ready",
        row_count: profile.quality.rowCount,
        column_count: profile.quality.columnCount,
        quality_score: profile.quality.score,
      },
      quality: profile.quality,
    });
  } catch (error) {
    const message =
      error instanceof IngestError
        ? [error.message, error.hint].filter(Boolean).join(" ")
        : error instanceof Error
          ? error.message
          : "The upload failed.";

    if (datasetId) {
      // Drop the half-loaded engine so a retry starts clean.
      closeEngine(engineKeyFor(session.organizationId, datasetId));
      await updateDataset(session, datasetId, {
        status: "failed",
        error_message: message,
      }).catch(() => undefined);
    }

    return NextResponse.json(
      { error: message },
      { status: error instanceof IngestError ? 400 : 500 },
    );
  }
}
