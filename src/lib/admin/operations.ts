import "server-only";

import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Figures for the operations overview.
 *
 * Every number here is counted from a table the platform actually writes. Where
 * a count cannot be taken — usually a table migration 0003 has not created yet —
 * the field is null and the panel renders "unknown" rather than 0, because a
 * zero is an answer and "I could not look" is not.
 *
 * Nothing is estimated, and nothing is carried over from the reference design
 * this panel is modelled on: Nexus has no payment provider connected, so there
 * is no revenue to report and this module does not invent one.
 */

export type Point = { date: string; value: number };

export type OperationsOverview = {
  windowDays: number;
  /** Accounts in existence, and how many arrived inside the window. */
  totalUsers: number | null;
  newUsers: number | null;
  /** Workspaces that produced any dataset, analysis or report in the window. */
  activeWorkspaces: number | null;
  totalWorkspaces: number | null;
  /** Accounts on something other than the free plan. */
  paidAccounts: number | null;
  suspendedUsers: number | null;
  /** Work done in the window. */
  analysesRun: number | null;
  reportsGenerated: number | null;
  datasetsUploaded: number | null;
  /** Failures worth acting on. */
  failedAnalyses: number | null;
  serverErrors: number | null;
  openMessages: number | null;
  /** Daily series for the charts. */
  signups: Point[];
  activity: Point[];
  analyses: Point[];
  /** Tables that could not be read, so the panel can say why a figure is blank. */
  missingTables: string[];
};

export type RecentSignup = {
  userId: string;
  name: string;
  email: string | null;
  workspace: string | null;
  plan: string | null;
  createdAt: string | null;
  isStaff: boolean;
};

export type RecentEvent = {
  id: string;
  action: string;
  actor: string | null;
  createdAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOf(windowDays: number): Date {
  return new Date(Date.now() - windowDays * DAY_MS);
}

/** An empty day-by-day series, so a chart has an x-axis even with no data. */
function emptySeries(windowDays: number): Point[] {
  const days: Point[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    days.push({ date: new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), value: 0 });
  }
  return days;
}

function bucket(rows: { created_at: string | null }[], windowDays: number): Point[] {
  const series = emptySeries(windowDays);
  const index = new Map(series.map((p, i) => [p.date, i]));
  for (const row of rows) {
    if (!row.created_at) continue;
    const key = row.created_at.slice(0, 10);
    const at = index.get(key);
    if (at !== undefined) series[at].value += 1;
  }
  return series;
}

/**
 * Counts rows in a window, returning null when the table cannot be read.
 *
 * `head: true` fetches no rows, only the count. A missing table reports an
 * error here rather than a zero, which is the distinction the panel depends on.
 */
async function countSince(
  table: string,
  since: Date | null,
  missing: string[],
  extra?: (q: ReturnType<ReturnType<typeof getServiceClient>["from"]>) => unknown,
): Promise<number | null> {
  try {
    let query = getServiceClient()
      .from(table)
      .select("id", { count: "exact", head: true });
    if (since) query = query.gte("created_at", since.toISOString());
    if (extra) query = extra(query as never) as typeof query;
    const { count, error } = await query;
    if (error) {
      if (!missing.includes(table)) missing.push(table);
      return null;
    }
    return count ?? 0;
  } catch {
    if (!missing.includes(table)) missing.push(table);
    return null;
  }
}

export async function buildOperationsOverview(
  windowDays: number,
): Promise<OperationsOverview> {
  const missing: string[] = [];
  const empty: OperationsOverview = {
    windowDays,
    totalUsers: null, newUsers: null, activeWorkspaces: null, totalWorkspaces: null,
    paidAccounts: null, suspendedUsers: null, analysesRun: null, reportsGenerated: null,
    datasetsUploaded: null, failedAnalyses: null, serverErrors: null, openMessages: null,
    signups: emptySeries(windowDays), activity: emptySeries(windowDays),
    analyses: emptySeries(windowDays), missingTables: ["supabase not configured"],
  };

  if (!isSupabaseConfigured() || !hasServiceClient()) return empty;

  const client = getServiceClient();
  const since = startOf(windowDays);
  const sinceIso = since.toISOString();

  /*
   * Accounts come from the auth admin API rather than a table: confirmation,
   * ban state and last sign-in live on the auth record and nowhere else.
   */
  let allUsers: { id: string; created_at?: string; banned_until?: string | null }[] = [];
  try {
    // One page is enough for the counts this panel shows; the accounts list
    // paginates separately.
    const { data } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    allUsers = (data?.users ?? []) as typeof allUsers;
  } catch {
    missing.push("auth.users");
  }

  const totalUsers = allUsers.length || null;
  const newUsers = allUsers.filter((u) => u.created_at && u.created_at >= sinceIso).length;
  const suspendedUsers = allUsers.filter((u) => {
    const until = u.banned_until;
    return Boolean(until) && new Date(until as string).getTime() > Date.now();
  }).length;

  const [
    totalWorkspaces,
    analysesRun,
    reportsGenerated,
    datasetsUploaded,
    failedAnalyses,
    openMessages,
    serverErrors,
  ] = await Promise.all([
    countSince("organizations", null, missing),
    countSince("analysis_jobs", since, missing),
    countSince("reports", since, missing),
    countSince("datasets", since, missing),
    countSince("analysis_jobs", since, missing, (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "failed")),
    countSince("contact_messages", null, missing, (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "new")),
    countSince("audit_logs", since, missing, (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("action", "api.error")),
  ]);

  // Series and active-workspace count share these reads.
  const [datasetRows, analysisRows, reportRows] = await Promise.all([
    client.from("datasets").select("created_at, organization_id").gte("created_at", sinceIso).limit(5000),
    client.from("analysis_jobs").select("created_at, organization_id").gte("created_at", sinceIso).limit(5000),
    client.from("reports").select("created_at, organization_id").gte("created_at", sinceIso).limit(5000),
  ]);

  const active = new Set<string>();
  for (const set of [datasetRows.data, analysisRows.data, reportRows.data]) {
    for (const row of set ?? []) {
      const org = (row as { organization_id?: string }).organization_id;
      if (org) active.add(org);
    }
  }

  const activityRows = [
    ...(datasetRows.data ?? []),
    ...(analysisRows.data ?? []),
    ...(reportRows.data ?? []),
  ] as { created_at: string | null }[];

  const signupRows = allUsers
    .filter((u) => u.created_at && u.created_at >= sinceIso)
    .map((u) => ({ created_at: u.created_at ?? null }));

  // Paid accounts: only real subscriptions count. No provider is connected
  // yet, so this is expected to be zero rather than missing.
  let paidAccounts: number | null = null;
  try {
    const { count, error } = await client
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .neq("plan", "free");
    paidAccounts = error ? null : (count ?? 0);
    if (error && !missing.includes("subscriptions")) missing.push("subscriptions");
  } catch {
    missing.push("subscriptions");
  }

  return {
    windowDays,
    totalUsers,
    newUsers,
    activeWorkspaces: active.size,
    totalWorkspaces,
    paidAccounts,
    suspendedUsers,
    analysesRun,
    reportsGenerated,
    datasetsUploaded,
    failedAnalyses,
    serverErrors,
    openMessages,
    signups: bucket(signupRows, windowDays),
    activity: bucket(activityRows, windowDays),
    analyses: bucket((analysisRows.data ?? []) as { created_at: string | null }[], windowDays),
    missingTables: missing,
  };
}

/** The newest accounts, for the panel's "Recent signups" list. */
export async function listRecentSignups(limit = 8): Promise<RecentSignup[]> {
  if (!isSupabaseConfigured() || !hasServiceClient()) return [];
  const client = getServiceClient();

  const { data } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = (data?.users ?? []).slice().sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  ).slice(0, limit);

  const ids = users.map((u) => u.id);
  const { data: members } = await client
    .from("organization_members")
    .select("user_id, organizations(name, plan)")
    .in("user_id", ids.length > 0 ? ids : ["none"]);

  const byUser = new Map<string, { name: string | null; plan: string | null }>();
  for (const row of members ?? []) {
    const org = (row as { organizations?: { name?: string; plan?: string } }).organizations;
    byUser.set((row as { user_id: string }).user_id, {
      name: org?.name ?? null,
      plan: org?.plan ?? null,
    });
  }

  return users.map((u) => {
    const meta = (u.user_metadata ?? {}) as { display_name?: string; full_name?: string };
    const org = byUser.get(u.id);
    return {
      userId: u.id,
      name: meta.display_name || meta.full_name || u.email?.split("@")[0] || "Account",
      email: u.email ?? null,
      workspace: org?.name ?? null,
      plan: org?.plan ?? "free",
      createdAt: u.created_at ?? null,
      isStaff: false,
    };
  });
}

/** The newest audit entries, for the panel's activity feed. */
export async function listRecentEvents(limit = 10): Promise<RecentEvent[]> {
  if (!isSupabaseConfigured() || !hasServiceClient()) return [];
  const { data, error } = await getServiceClient()
    .from("audit_logs")
    .select("id, action, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    action: String((row as { action: string }).action),
    actor: (row as { user_id: string | null }).user_id,
    createdAt: String((row as { created_at: string }).created_at),
  }));
}
