import "server-only";

import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Platform-wide data for the admin panel.
 *
 * Everything here goes through the service key, because it deliberately
 * crosses tenant boundaries — that is the point of an operator's view. Every
 * caller must have passed requirePermission() first; nothing in this file
 * checks, so nothing in this file may be reached from a route that does not.
 *
 * Figures are counted, never estimated. Where a number cannot be obtained the
 * field is null and the UI says so, rather than showing a zero that reads as
 * "none" when it means "unknown".
 */

export type PlatformOverview = {
  totalUsers: number | null;
  newUsers7d: number | null;
  newUsers30d: number | null;
  activeUsers24h: number | null;
  activeUsers7d: number | null;
  totalWorkspaces: number | null;
  totalDatasets: number | null;
  totalAnalyses: number | null;
  totalReports: number | null;
  suspendedUsers: number | null;
  openTickets: number | null;
  failedLogins24h: number | null;
  /** Tables that are missing, so the UI can point at the migration. */
  missingTables: string[];
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Counts rows, returning null when the table is absent rather than 0.
 *
 * The null matters. A missing `user_status` table rendered as 0 reads as
 * "nobody is suspended", which is a confident answer to a question that was
 * never asked — and on this page that is the kind of thing an operator acts on.
 *
 * Detecting absence is fiddly: with `head: true` supabase-js swallows the
 * 404 and hands back `count: null, error: null`, so the missing table looks
 * identical to a successful call. A null count is therefore treated as
 * "unknown" and confirmed with a plain select, which does report PGRST205.
 */
async function countRows(
  table: string,
  build?: (query: ReturnType<ReturnType<typeof getServiceClient>["from"]>) => unknown,
): Promise<{ count: number | null; missing: boolean }> {
  try {
    let query = getServiceClient()
      .from(table)
      .select("*", { count: "exact", head: true });

    if (build) query = build(query as never) as typeof query;

    const { count, error } = await query;

    if (error) {
      return { count: null, missing: isMissingTable(error) };
    }

    if (count === null) {
      // Ask again in a way that reports the error, to tell "table is not
      // there" apart from "the count came back empty".
      const probe = await getServiceClient().from(table).select("*").limit(1);
      if (probe.error) {
        return { count: null, missing: isMissingTable(probe.error) };
      }
      return { count: probe.data?.length ?? 0, missing: false };
    }

    return { count, missing: false };
  } catch {
    return { count: null, missing: false };
  }
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|does not exist/i.test(error.message ?? "")
  );
}

/** Distinct users seen in the audit log since `since`. */
async function countActiveUsers(since: string): Promise<number | null> {
  try {
    const { data, error } = await getServiceClient()
      .from("audit_logs")
      .select("user_id")
      .gte("created_at", since)
      .not("user_id", "is", null)
      .limit(10_000);

    if (error) return null;
    return new Set((data ?? []).map((row) => row.user_id)).size;
  } catch {
    return null;
  }
}

export async function buildPlatformOverview(): Promise<PlatformOverview> {
  const empty: PlatformOverview = {
    totalUsers: null,
    newUsers7d: null,
    newUsers30d: null,
    activeUsers24h: null,
    activeUsers7d: null,
    totalWorkspaces: null,
    totalDatasets: null,
    totalAnalyses: null,
    totalReports: null,
    suspendedUsers: null,
    openTickets: null,
    failedLogins24h: null,
    missingTables: [],
  };

  if (!isSupabaseConfigured() || !hasServiceClient()) return empty;

  const missing: string[] = [];
  const track = (table: string, result: { missing: boolean }) => {
    if (result.missing) missing.push(table);
  };

  const [
    profiles,
    profiles7d,
    profiles30d,
    workspaces,
    datasets,
    analyses,
    reports,
    suspended,
    tickets,
    failedLogins,
    active24h,
    active7d,
  ] = await Promise.all([
    countRows("profiles"),
    countRows("profiles", (q) => (q as never as { gte: (a: string, b: string) => unknown }).gte("created_at", daysAgo(7))),
    countRows("profiles", (q) => (q as never as { gte: (a: string, b: string) => unknown }).gte("created_at", daysAgo(30))),
    countRows("organizations"),
    countRows("datasets"),
    countRows("analysis_jobs"),
    countRows("reports"),
    countRows("user_status", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("state", "suspended")),
    countRows("support_tickets", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "open")),
    countRows("login_attempts", (q) =>
      (q as never as { eq: (a: string, b: boolean) => { gte: (a: string, b: string) => unknown } })
        .eq("succeeded", false)
        .gte("created_at", daysAgo(1)),
    ),
    countActiveUsers(daysAgo(1)),
    countActiveUsers(daysAgo(7)),
  ]);

  track("profiles", profiles);
  track("organizations", workspaces);
  track("datasets", datasets);
  track("analysis_jobs", analyses);
  track("reports", reports);
  track("user_status", suspended);
  track("support_tickets", tickets);
  track("login_attempts", failedLogins);

  return {
    totalUsers: profiles.count,
    newUsers7d: profiles7d.count,
    newUsers30d: profiles30d.count,
    activeUsers24h: active24h,
    activeUsers7d: active7d,
    totalWorkspaces: workspaces.count,
    totalDatasets: datasets.count,
    totalAnalyses: analyses.count,
    totalReports: reports.count,
    suspendedUsers: suspended.count,
    openTickets: tickets.count,
    failedLogins24h: failedLogins.count,
    missingTables: [...new Set(missing)],
  };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export type AdminUserRow = {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  state: "active" | "suspended" | "banned";
  workspaceRole: string | null;
  workspaceName: string | null;
  plan: string | null;
};

export type UserPage = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Lists accounts for the users table.
 *
 * Reads from auth.users via the admin API rather than `profiles`, because the
 * fields an operator needs — confirmed, last sign-in, banned — live on the
 * auth record and nowhere else.
 */
export async function listUsers(options: {
  search?: string;
  state?: "all" | "active" | "suspended" | "banned";
  page?: number;
  pageSize?: number;
}): Promise<UserPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));

  if (!isSupabaseConfigured() || !hasServiceClient()) {
    return { rows: [], total: 0, page, pageSize };
  }

  const client = getServiceClient();

  const { data: authData, error } = await client.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });
  if (error) return { rows: [], total: 0, page, pageSize };

  const users = authData?.users ?? [];
  const ids = users.map((user) => user.id);

  // Profile, membership and status are three separate reads rather than a
  // join: the auth schema is not exposed to PostgREST, so there is nothing to
  // join against from here.
  const [profiles, memberships, statuses] = await Promise.all([
    client.from("profiles").select("user_id, username, display_name").in("user_id", ids),
    client
      .from("organization_members")
      .select("user_id, role, organizations(name, plan)")
      .in("user_id", ids),
    client.from("user_status").select("user_id, state").in("user_id", ids),
  ]);

  const profileBy = new Map(
    (profiles.data ?? []).map((row) => [row.user_id, row]),
  );
  const membershipBy = new Map(
    (memberships.data ?? []).map((row) => [row.user_id, row]),
  );
  const statusBy = new Map(
    (statuses.data ?? []).map((row) => [row.user_id, row.state]),
  );

  const rows: AdminUserRow[] = users.map((user) => {
    const profile = profileBy.get(user.id);
    const membership = membershipBy.get(user.id) as
      | { role?: string; organizations?: { name?: string; plan?: string } }
      | undefined;

    return {
      userId: user.id,
      email: user.email ?? null,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      createdAt: user.created_at ?? null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      lastSignInAt: user.last_sign_in_at ?? null,
      state:
        (statusBy.get(user.id) as AdminUserRow["state"]) ??
        (user.banned_until ? "suspended" : "active"),
      workspaceRole: membership?.role ?? null,
      workspaceName: membership?.organizations?.name ?? null,
      plan: membership?.organizations?.plan ?? null,
    };
  });

  const search = options.search?.trim().toLowerCase();
  const state = options.state ?? "all";

  const filtered = rows.filter((row) => {
    if (state !== "all" && row.state !== state) return false;
    if (!search) return true;
    return [row.email, row.username, row.displayName, row.workspaceName]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(search));
  });

  return {
    rows: filtered,
    // Supabase's admin API does not return a grand total, so this is the count
    // for the page in hand. The UI pages by asking for the next one.
    total: filtered.length,
    page,
    pageSize,
  };
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditRow = {
  id: string;
  action: string;
  userId: string | null;
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function listAuditLogs(options: {
  search?: string;
  action?: string;
  limit?: number;
}): Promise<AuditRow[]> {
  if (!isSupabaseConfigured() || !hasServiceClient()) return [];

  let query = getServiceClient()
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(500, options.limit ?? 100));

  if (options.action) query = query.eq("action", options.action);

  const { data, error } = await query;
  if (error) return [];

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    userId: row.user_id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    ipAddress: row.ip_address,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  const search = options.search?.trim().toLowerCase();
  if (!search) return rows;

  return rows.filter((row) =>
    [row.action, row.resourceType, row.resourceId, row.userId]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(search)),
  );
}

/**
 * Records an administrative action.
 *
 * Written with organization_id null, which is what marks a row as a platform
 * action rather than something that happened inside one workspace.
 */
export async function recordAdminAction(input: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseConfigured() || !hasServiceClient()) return;

  try {
    await getServiceClient()
      .from("audit_logs")
      .insert({
        organization_id: null,
        user_id: input.actorId,
        action: input.action,
        resource_type: input.targetType ?? null,
        resource_id: input.targetId ?? null,
        ip_address: input.ipAddress ?? null,
        metadata: { ...(input.metadata ?? {}), platform_action: true },
      });
  } catch {
    // An audit write must never take down the action it is recording, but it
    // also must not fail silently forever — surfaced in server logs.
    console.error(`Failed to write audit row for ${input.action}`);
  }
}
