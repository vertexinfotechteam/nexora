import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it is confined to operations that
 * genuinely cannot run as the user:
 *   - resolving username -> email during login
 *   - writing audit_logs / usage_events
 *   - storage reads for the analysis engine
 *
 * Never import this from a Client Component. `server-only` enforces that.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const config = getSupabaseConfig();
  if (!config?.serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local.",
    );
  }

  cached = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export function hasServiceClient(): boolean {
  return Boolean(getSupabaseConfig()?.serviceRoleKey);
}
