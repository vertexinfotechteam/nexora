"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, used only to send a file to a signed storage URL.
 *
 * It carries no session and needs none: uploadToSignedUrl authenticates with
 * the one-time token the server issued for a single path, not with the user's
 * credentials. The auth cookies are httpOnly and deliberately unreadable from
 * JavaScript, and nothing here tries to read them.
 *
 * Only NEXT_PUBLIC_ values are referenced. The anon key is designed to be
 * public and is constrained by row level security; the service key must never
 * appear in this file or anything it imports.
 */
let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (cached) return cached;

  cached = createClient(url, anonKey, {
    // No session handling at all: this client exists for one signed upload.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
