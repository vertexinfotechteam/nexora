import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { LOCAL_SESSION_COOKIE } from "@/lib/auth/session";
import { audit } from "@/lib/store";

export async function POST() {
  const session = await getSession();

  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();

  const store = await cookies();
  store.delete(LOCAL_SESSION_COOKIE);

  if (session) {
    await audit({
      organization_id: session.organizationId || null,
      user_id: session.userId,
      action: "auth.logout",
    });
  }

  return NextResponse.json({ ok: true });
}
