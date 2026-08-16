"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client. Only ever sees NEXT_PUBLIC_ values — the anon key is designed
 * to be public and is constrained by RLS. The service-role key must never
 * appear in this file or anything it imports.
 */
let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (cached) return cached;
  cached = createBrowserClient(url, anonKey);
  return cached;
}
