import { NextResponse } from "next/server";

/**
 * Temporary deployment diagnostic.
 *
 * Every page on the deployed site returned 500 while API routes answered
 * normally, and the platform logs were not to hand. API routes still work, so
 * this one runs the same steps a page render does and reports which one throws.
 *
 * It reports only whether a variable is present and how long it is — never a
 * value, or any part of one. Delete this route once the cause is found.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function presence(name: string) {
  const value = process.env[name];
  return value ? `set (${value.length} chars)` : "MISSING";
}

async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    const value = await fn();
    return { step: label, ok: true, detail: typeof value };
  } catch (error) {
    return {
      step: label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error
          ? (error.stack ?? "").split("\n").slice(0, 6).join(" | ")
          : undefined,
    };
  }
}

export async function GET() {
  const steps = [];

  steps.push(
    await attempt("import next/headers cookies()", async () => {
      const { cookies } = await import("next/headers");
      return (await cookies()).getAll().length;
    }),
  );

  steps.push(
    await attempt("import @/lib/env", async () => {
      const mod = await import("@/lib/env");
      return mod.isSupabaseConfigured();
    }),
  );

  steps.push(
    await attempt("create server supabase client", async () => {
      const { getServerSupabase } = await import("@/lib/supabase/server");
      return Boolean(await getServerSupabase());
    }),
  );

  steps.push(
    await attempt("getSession() — what every page calls", async () => {
      const { getSession } = await import("@/lib/auth/session");
      const session = await getSession();
      return session ? "session" : "anonymous";
    }),
  );

  steps.push(
    await attempt("render-time font import (root layout)", async () => {
      await import("next/font/google");
      return "loaded";
    }),
  );

  return NextResponse.json(
    {
      node: process.version,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL ? process.env.VERCEL_REGION ?? "yes" : "no",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: presence("NEXT_PUBLIC_SUPABASE_URL"),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: presence("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: presence("SUPABASE_SERVICE_ROLE_KEY"),
        GEMINI_API_KEY: presence("GEMINI_API_KEY"),
        NEXUS_SITE_URL: presence("NEXUS_SITE_URL"),
        NEXUS_PLATFORM_ADMIN_EMAILS: presence("NEXUS_PLATFORM_ADMIN_EMAILS"),
      },
      steps,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
