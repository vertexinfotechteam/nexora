import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { LOCAL_IDENTITY } from "@/lib/store/local";
import type { OrgRole, Session } from "@/lib/store/types";

export const LOCAL_SESSION_COOKIE = "nx_local_session";

/**
 * Resolves the current session.
 *
 * Supabase mode: the user comes from `getUser()`, which validates the JWT with
 * the auth server on every call — never from `getSession()`, whose cookie
 * payload is client-controlled and therefore not trustworthy for authorization.
 *
 * Local mode: a signed-in-by-opt-in development identity, clearly labelled in
 * the UI. It exists so the analytics pipeline can be used before a Supabase
 * project is connected; it grants no access to anything beyond this machine.
 *
 * Wrapped in React's cache(), which de-duplicates calls within one request.
 * This is called from 52 places — the layout, the page and several components
 * can each ask during a single render, and every ask was its own network round
 * trip for an answer that cannot change mid-request. The cache is per-request,
 * never global: two requests share nothing, and the validation itself is
 * unchanged, so a revoked or edited token is still caught on the next one.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    const store = await cookies();
    if (!store.get(LOCAL_SESSION_COOKIE)) return null;
    return {
      userId: LOCAL_IDENTITY.userId,
      organizationId: LOCAL_IDENTITY.organizationId,
      username: LOCAL_IDENTITY.username,
      displayName: LOCAL_IDENTITY.displayName,
      email: null,
      role: "owner",
      organizationName: LOCAL_IDENTITY.organizationName,
      plan: "free",
      mode: "local",
    };
  }

  const client = await getServerSupabase();
  if (!client) return null;

  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await client
    .from("profiles")
    .select("username, display_name, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id, role, organizations(name, plan)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!profile || !membership) {
    // Authenticated, but no workspace yet. The app layout provisions one on
    // the next request; an empty organizationId is the signal it watches for.
    return {
      userId: user.id,
      organizationId: "",
      username: profile?.username ?? "",
      displayName: profile?.display_name ?? null,
      email: user.email ?? null,
      role: "viewer",
      organizationName: "",
      plan: "free",
      mode: "supabase",
    };
  }

  const org = membership.organizations as unknown as {
    name: string;
    plan: Session["plan"];
  } | null;

  return {
    userId: user.id,
    organizationId: membership.organization_id as string,
    username: profile.username as string,
    displayName: (profile.display_name as string | null) ?? null,
    email: user.email ?? null,
    role: membership.role as OrgRole,
    organizationName: org?.name ?? "Workspace",
    plan: org?.plan ?? "free",
    mode: "supabase",
  };
});

/** Session guaranteed to have a workspace. Throws for callers that need one. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new SessionError("Not signed in.", 401);
  if (!session.organizationId) {
    throw new SessionError("Workspace setup is not complete.", 403);
  }
  return session;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/** Analyst and above may run analyses, upload data, and edit dashboards. */
export function canWrite(session: Session): boolean {
  return ["owner", "admin", "analyst"].includes(session.role);
}

export function assertCanWrite(session: Session): void {
  if (!canWrite(session)) {
    throw new SessionError(
      "Your role does not permit this action. Ask a workspace admin for analyst access.",
      403,
    );
  }
}
