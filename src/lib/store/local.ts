import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_DATA_DIR } from "@/lib/env";

/**
 * JSON-document store used when Supabase is not connected yet.
 *
 * Deliberately simple: one file per collection, written atomically via
 * write-to-temp + rename, serialized through an in-process promise chain so
 * concurrent requests cannot interleave a read-modify-write.
 *
 * This is a development/bootstrap driver. The Supabase driver is the
 * production path and carries the real multi-tenant guarantees.
 */

function metaDir(): string {
  return path.resolve(process.cwd(), LOCAL_DATA_DIR, "meta");
}

function fileFor(collection: string): string {
  if (!/^[a-z_]+$/.test(collection)) {
    throw new Error(`Invalid collection name: ${collection}`);
  }
  return path.join(metaDir(), `${collection}.json`);
}

/** Serializes all writes; each collection gets its own tail promise. */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(collection: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(collection) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(
    collection,
    next.catch(() => undefined),
  );
  return next;
}

export async function readCollection<T>(collection: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(fileFor(collection), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  // Windows editors and PowerShell commonly prepend a UTF-8 BOM, which
  // JSON.parse rejects. Strip it rather than failing the whole request.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (raw.trim().length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Corruption is reported loudly rather than silently treated as empty —
    // returning [] here would look like the user's data had vanished.
    throw new Error(
      `The local data file "${collection}.json" is not valid JSON. Fix or delete it and retry.`,
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Atomic-ish write: stage to a temp file, then rename over the target.
 *
 * On Windows a rename onto an existing file fails with EPERM/EBUSY whenever
 * anything else holds a handle to it — a concurrent read from this process,
 * a virus scanner, or the file indexer. The retry loop covers those transient
 * cases; the final fallback writes in place so a save can never be lost.
 */
async function writeCollection<T>(collection: string, rows: T[]): Promise<void> {
  const target = fileFor(collection);
  await mkdir(path.dirname(target), { recursive: true });

  const payload = JSON.stringify(rows, null, 2);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, payload, "utf8");

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rename(temp, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") {
        await rm(temp, { force: true });
        throw error;
      }
      await sleep(15 * (attempt + 1));
    }
  }

  // Rename kept failing. Write directly rather than dropping the change.
  await writeFile(target, payload, "utf8");
  await rm(temp, { force: true });
}

export function mutateCollection<T>(
  collection: string,
  mutator: (rows: T[]) => T[] | Promise<T[]>,
): Promise<void> {
  return withLock(collection, async () => {
    const rows = await readCollection<T>(collection);
    await writeCollection(collection, await mutator(rows));
  });
}

export async function insertLocal<T extends { id: string }>(
  collection: string,
  row: T,
): Promise<T> {
  await mutateCollection<T>(collection, (rows) => [...rows, row]);
  return row;
}

export async function updateLocal<T extends { id: string }>(
  collection: string,
  id: string,
  patch: Partial<T>,
): Promise<void> {
  await mutateCollection<T>(collection, (rows) =>
    rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

export async function deleteLocal(
  collection: string,
  predicate: (row: { id: string } & Record<string, unknown>) => boolean,
): Promise<void> {
  await mutateCollection<{ id: string } & Record<string, unknown>>(
    collection,
    (rows) => rows.filter((row) => !predicate(row)),
  );
}

export async function findLocal<T>(
  collection: string,
  predicate: (row: T) => boolean,
): Promise<T[]> {
  const rows = await readCollection<T>(collection);
  return rows.filter(predicate);
}

/**
 * Fixed identity for local mode. Stable UUIDs keep storage paths and foreign
 * keys valid across restarts, and make the eventual Supabase import trivial.
 */
export const LOCAL_IDENTITY = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-0000000000a1",
  username: "local_analyst",
  displayName: "Local Analyst",
  organizationName: "Local Workspace",
} as const;
