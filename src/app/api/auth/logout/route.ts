import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSession, LOCAL_SESSION_COOKIE } from "@/lib/auth/session";
import { expiredAuthCookie, isAuthCookie } from "@/lib/auth/cookies";
import { audit } from "@/lib/store";

/**
 * Signs the user out.
 *
 * Every auth cookie is cleared explicitly rather than trusting signOut() to
 * have removed them: Supabase splits large sessions across numbered chunks
 * (sb-<ref>-auth-token.0, .1, …), and a chunk left behind can be enough to
 * rebuild a session. Sweeping every sb-* cookie removes the whole set
 * whatever it was named.
 *
 * The response is marked no-store so the browser cannot serve a cached copy
 * of a signed-in page afterwards.
 */
export async function POST() {
  const session = await getSession();

  const supabase = await getServerSupabase();
  if (supabase) {
    // "global" revokes the refresh token server-side, so a copy of the cookie
    // taken beforehand is dead too — not merely forgotten by this browser.
    await supabase.auth.signOut({ scope: "global" });
  }

  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (isAuthCookie(cookie.name)) {
      store.set(cookie.name, "", expiredAuthCookie());
    }
  }
  store.set(LOCAL_SESSION_COOKIE, "", expiredAuthCookie());

  if (session) {
    await audit({
      organization_id: session.organizationId || null,
      user_id: session.userId,
      action: "auth.logout",
    });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return response;
}
