import "server-only";

import { getSupabaseConfig } from "@/lib/env";
import { getServiceClient, hasServiceClient } from "./admin";

/**
 * Is the database schema actually installed?
 *
 * Supabase Auth works the moment the project exists, but `auth.users` is the
 * only table that comes for free. If the migration has not been run, sign-up
 * creates an auth user and then fails on the very next step with a confusing
 * error about a missing relation.
 *
 * Checking first turns that into a message that names the actual problem.
 */

let cached: { ready: boolean; checkedAt: number } | null = null;
/** Short TTL: long enough to avoid a probe per request, short enough that the
 *  app notices within a minute of the migration being run. */
const TTL_MS = 30_000;

export async function isSchemaReady(): Promise<boolean> {
  if (!getSupabaseConfig() || !hasServiceClient()) return false;

  const now = Date.now();
  if (cached && now - cached.checkedAt < TTL_MS) return cached.ready;

  try {
    /*
     * `profiles` is the first table sign-up touches, so it is the right probe.
     *
     * This must NOT use `head: true`. A HEAD request against a missing table
     * comes back from supabase-js as `{ error: null, count: null }` — the 404
     * is swallowed — so the probe would report the schema as present and the
     * guard would never fire. A normal select surfaces PGRST205 properly.
     */
    const { error } = await getServiceClient()
      .from("profiles")
      .select("id")
      .limit(1);

    // PGRST205 / 42P01 both mean "relation does not exist".
    const ready = !error || !/does not exist|schema cache|PGRST205/i.test(
      `${error.code ?? ""} ${error.message ?? ""}`,
    );
    cached = { ready, checkedAt: now };
    return ready;
  } catch {
    cached = { ready: false, checkedAt: now };
    return false;
  }
}

/** Clears the cache so the next call re-probes immediately. */
export function invalidateSchemaCache(): void {
  cached = null;
}

export const SCHEMA_MISSING_MESSAGE =
  "The database tables have not been created yet. Open your Supabase project's SQL Editor, run supabase/migrations/0001_nexora_init.sql once, then try again.";
