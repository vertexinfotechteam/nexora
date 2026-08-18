import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import { validateUpload, IngestError } from "@/lib/ingest/source";
import { buildStoragePath, sanitizeFileName, STORAGE_BUCKET } from "@/lib/storage";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { boundedString } from "@/lib/security/validate";
import { enforceLimit } from "@/lib/security/guard";
import { UPLOAD_LIMITS } from "@/lib/env";

export const maxDuration = 30;

/**
 * Hands the browser a one-time URL to upload a file straight to storage.
 *
 * Files used to be POSTed to our own route, which meant every byte travelled
 * through the serverless function. That caps the whole product at whatever
 * request body the host accepts — 4.5 MB on Vercel, unchangeable on any plan —
 * so a 40 MB export was refused by the platform before any of our code ran.
 *
 * With a signed URL the file goes browser -> storage directly. Nothing large
 * passes through the function, and the ceiling becomes the one we choose.
 *
 * The URL is scoped to a single path that this route decides, so the caller
 * cannot pick where their file lands or overwrite anyone else's: the
 * organization and user segments come from the session, and the dataset
 * segment is generated here.
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

  if (!hasServiceClient()) {
    return NextResponse.json(
      { error: "Direct upload needs Supabase storage to be configured." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as { fileName?: unknown; sizeBytes?: unknown };
  const rawName = boundedString(body.fileName, 255);
  const sizeBytes = Number(body.sizeBytes);

  if (!rawName) {
    return NextResponse.json({ error: "A file name is required." }, { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "A file size is required." }, { status: 400 });
  }

  const fileName = sanitizeFileName(rawName);

  /*
   * The size and type are checked here, before a URL is issued, so an
   * oversized or unsupported file is refused in one small request rather than
   * after the user has waited for a long transfer to finish.
   */
  try {
    validateUpload(fileName, sizeBytes);
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json(
        { error: error.message, hint: error.hint },
        { status: 400 },
      );
    }
    throw error;
  }

  const datasetId = randomUUID();
  const storagePath = buildStoragePath({
    organizationId: session.organizationId,
    userId: session.userId,
    datasetId,
    fileName,
  });

  const { data, error } = await getServiceClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: `Could not prepare the upload: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      datasetId,
      storagePath,
      fileName,
      bucket: STORAGE_BUCKET,
      token: data.token,
      maxBytes: UPLOAD_LIMITS.maxBytes,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
