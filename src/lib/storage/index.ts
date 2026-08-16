import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSupabaseConfig, LOCAL_DATA_DIR } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/admin";

/**
 * Dataset file storage.
 *
 * Two drivers behind one interface:
 *   - supabase: private `datasets` bucket, path organization_id/user_id/dataset_id/file
 *   - local:    the same path layout under ./.nexora/datasets, for running
 *               before a Supabase project is connected
 *
 * The analytical engine can only read local files, so `materialize()` is the
 * single place that guarantees a readable absolute path regardless of driver.
 */

export const STORAGE_BUCKET = "datasets";

export type StorageRef = {
  organizationId: string;
  userId: string;
  datasetId: string;
  fileName: string;
};

export function buildStoragePath(ref: StorageRef): string {
  // Every segment is a UUID or a sanitized filename — never raw user input.
  return `${ref.organizationId}/${ref.userId}/${ref.datasetId}/${ref.fileName}`;
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "upload.dat";
}

function localRoot(): string {
  return path.resolve(process.cwd(), LOCAL_DATA_DIR, "datasets");
}

/**
 * Resolves a storage path to an absolute local path, refusing anything that
 * escapes the storage root. Defends against `../` in a crafted path.
 */
function resolveLocal(storagePath: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, storagePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage path.");
  }
  return resolved;
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function putObject(
  storagePath: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const supabase = getSupabaseConfig();
  if (supabase?.serviceRoleKey) {
    const client = getServiceClient();
    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return;
  }

  const target = resolveLocal(storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function getObject(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseConfig();
  if (supabase?.serviceRoleKey) {
    const client = getServiceClient();
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) {
      throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(resolveLocal(storagePath));
}

export async function deleteObject(storagePath: string): Promise<void> {
  const supabase = getSupabaseConfig();
  if (supabase?.serviceRoleKey) {
    const client = getServiceClient();
    await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return;
  }
  await rm(resolveLocal(storagePath), { force: true });
}

/**
 * Returns an absolute local path DuckDB can read.
 *
 * Local driver: the file is already on disk, so this is a no-op resolve.
 * Supabase driver: the object is downloaded into a per-dataset temp directory
 * and cached there for the lifetime of the process.
 */
export async function materialize(
  storagePath: string,
  datasetId: string,
): Promise<string> {
  const supabase = getSupabaseConfig();
  if (!supabase?.serviceRoleKey) {
    const local = resolveLocal(storagePath);
    await stat(local); // throws a clear ENOENT if the file vanished
    return local;
  }

  const cacheDir = path.join(tmpdir(), "nexora-cache", datasetId);
  const cached = path.join(cacheDir, path.basename(storagePath));
  try {
    await stat(cached);
    return cached;
  } catch {
    // not cached yet
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, await getObject(storagePath));
  return cached;
}

export async function clearMaterialized(datasetId: string): Promise<void> {
  await rm(path.join(tmpdir(), "nexora-cache", datasetId), {
    recursive: true,
    force: true,
  });
}
