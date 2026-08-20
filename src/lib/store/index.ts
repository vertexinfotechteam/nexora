import "server-only";

import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import {
  deleteLocal,
  findLocal,
  insertLocal,
  readCollection,
  updateLocal,
} from "./local";
import type {
  Anomaly,
  AnalysisJob,
  AnalysisResult,
  Alert,
  AuditEntry,
  Dashboard,
  DashboardWidget,
  WidgetConfig,
  WidgetType,
  Dataset,
  DatasetColumn,
  DatasetFile,
  DatasetProfile,
  Forecast,
  Recommendation,
  Report,
  Session,
} from "./types";

/**
 * Single data-access surface for the app.
 *
 * In Supabase mode every read and write goes through the *user's* client, so
 * RLS is the enforcement point — a bug in this file cannot leak another
 * tenant's rows. The service-role client is used only for audit logging, which
 * users must not be able to write directly.
 */

export function storeMode(): "supabase" | "local" {
  return isSupabaseConfigured() ? "supabase" : "local";
}

async function supabaseOrThrow() {
  const client = await getServerSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

export function newId(): string {
  return randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export async function createDataset(
  session: Session,
  input: Pick<Dataset, "name" | "description" | "file_type" | "size_bytes">,
): Promise<Dataset> {
  const row: Dataset = {
    id: newId(),
    organization_id: session.organizationId,
    owner_id: session.userId,
    name: input.name,
    description: input.description ?? null,
    status: "uploading",
    file_type: input.file_type ?? null,
    row_count: null,
    column_count: null,
    size_bytes: input.size_bytes ?? null,
    quality_score: null,
    last_analyzed_at: null,
    error_message: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (storeMode() === "local") return insertLocal("datasets", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("datasets")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not create dataset: ${error.message}`);
  return data as Dataset;
}

export async function updateDataset(
  session: Session,
  id: string,
  patch: Partial<Dataset>,
): Promise<void> {
  const withStamp = { ...patch, updated_at: nowIso() };
  if (storeMode() === "local") {
    await updateLocal<Dataset>("datasets", id, withStamp);
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("datasets")
    .update(withStamp)
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not update dataset: ${error.message}`);
}

export async function listDatasets(session: Session): Promise<Dataset[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Dataset>(
      "datasets",
      (d) =>
        d.organization_id === session.organizationId && d.status !== "archived",
    );
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("datasets")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not list datasets: ${error.message}`);
  return (data ?? []) as Dataset[];
}

export async function getDataset(
  session: Session,
  id: string,
): Promise<Dataset | null> {
  if (storeMode() === "local") {
    const rows = await findLocal<Dataset>(
      "datasets",
      (d) => d.id === id && d.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("datasets")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load dataset: ${error.message}`);
  return (data as Dataset) ?? null;
}

export async function deleteDataset(
  session: Session,
  id: string,
): Promise<void> {
  if (storeMode() === "local") {
    await deleteLocal("datasets", (row) => row.id === id);
    await deleteLocal("dataset_files", (row) => row.dataset_id === id);
    await deleteLocal("dataset_columns", (row) => row.dataset_id === id);
    await deleteLocal("dataset_profiles", (row) => row.dataset_id === id);
    return;
  }
  const client = await supabaseOrThrow();
  // Child rows cascade via foreign keys.
  const { error } = await client
    .from("datasets")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not delete dataset: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Dataset files / columns / profiles
// ---------------------------------------------------------------------------

export async function createDatasetFile(
  session: Session,
  input: Omit<DatasetFile, "id" | "created_at" | "organization_id">,
): Promise<DatasetFile> {
  const row: DatasetFile = {
    ...input,
    id: newId(),
    organization_id: session.organizationId,
    created_at: nowIso(),
  };
  if (storeMode() === "local") return insertLocal("dataset_files", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dataset_files")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not record file: ${error.message}`);
  return data as DatasetFile;
}

export async function getDatasetFile(
  session: Session,
  datasetId: string,
): Promise<DatasetFile | null> {
  if (storeMode() === "local") {
    const rows = await findLocal<DatasetFile>(
      "dataset_files",
      (f) =>
        f.dataset_id === datasetId &&
        f.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dataset_files")
    .select("*")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load file: ${error.message}`);
  return (data as DatasetFile) ?? null;
}

export async function replaceDatasetColumns(
  session: Session,
  datasetId: string,
  columns: Omit<DatasetColumn, "id" | "organization_id" | "dataset_id">[],
): Promise<void> {
  const rows: DatasetColumn[] = columns.map((column) => ({
    ...column,
    id: newId(),
    dataset_id: datasetId,
    organization_id: session.organizationId,
  }));

  if (storeMode() === "local") {
    await deleteLocal("dataset_columns", (row) => row.dataset_id === datasetId);
    for (const row of rows) await insertLocal("dataset_columns", row);
    return;
  }
  const client = await supabaseOrThrow();
  await client.from("dataset_columns").delete().eq("dataset_id", datasetId);
  const { error } = await client.from("dataset_columns").insert(rows);
  if (error) throw new Error(`Could not save schema: ${error.message}`);
}

export async function listDatasetColumns(
  session: Session,
  datasetId: string,
): Promise<DatasetColumn[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<DatasetColumn>(
      "dataset_columns",
      (c) =>
        c.dataset_id === datasetId &&
        c.organization_id === session.organizationId,
    );
    return rows.sort((a, b) => a.position - b.position);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dataset_columns")
    .select("*")
    .eq("dataset_id", datasetId)
    .order("position");
  if (error) throw new Error(`Could not load schema: ${error.message}`);
  return (data ?? []) as DatasetColumn[];
}

export async function replaceDatasetProfiles(
  session: Session,
  datasetId: string,
  profiles: Omit<DatasetProfile, "id" | "organization_id" | "dataset_id">[],
): Promise<void> {
  const rows: DatasetProfile[] = profiles.map((profile) => ({
    ...profile,
    id: newId(),
    dataset_id: datasetId,
    organization_id: session.organizationId,
  }));

  if (storeMode() === "local") {
    await deleteLocal("dataset_profiles", (row) => row.dataset_id === datasetId);
    for (const row of rows) await insertLocal("dataset_profiles", row);
    return;
  }
  const client = await supabaseOrThrow();
  await client.from("dataset_profiles").delete().eq("dataset_id", datasetId);
  const { error } = await client.from("dataset_profiles").insert(rows);
  if (error) throw new Error(`Could not save profile: ${error.message}`);
}

export async function listDatasetProfiles(
  session: Session,
  datasetId: string,
): Promise<DatasetProfile[]> {
  if (storeMode() === "local") {
    return findLocal<DatasetProfile>(
      "dataset_profiles",
      (p) =>
        p.dataset_id === datasetId &&
        p.organization_id === session.organizationId,
    );
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dataset_profiles")
    .select("*")
    .eq("dataset_id", datasetId);
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return (data ?? []) as DatasetProfile[];
}

// ---------------------------------------------------------------------------
// Analysis jobs and results
// ---------------------------------------------------------------------------

export async function createJob(
  session: Session,
  input: { datasetId: string | null; question: string },
): Promise<AnalysisJob> {
  const row: AnalysisJob = {
    id: newId(),
    organization_id: session.organizationId,
    dataset_id: input.datasetId,
    user_id: session.userId,
    question: input.question,
    status: "queued",
    provider: null,
    model: null,
    steps: [],
    started_at: null,
    finished_at: null,
    duration_ms: null,
    error_message: null,
    created_at: nowIso(),
  };
  if (storeMode() === "local") return insertLocal("analysis_jobs", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("analysis_jobs")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not start analysis: ${error.message}`);
  return data as AnalysisJob;
}

export async function updateJob(
  session: Session,
  id: string,
  patch: Partial<AnalysisJob>,
): Promise<void> {
  if (storeMode() === "local") {
    await updateLocal<AnalysisJob>("analysis_jobs", id, patch);
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("analysis_jobs")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not update analysis: ${error.message}`);
}

export async function getJob(
  session: Session,
  id: string,
): Promise<AnalysisJob | null> {
  if (storeMode() === "local") {
    const rows = await findLocal<AnalysisJob>(
      "analysis_jobs",
      (j) => j.id === id && j.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("analysis_jobs")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load analysis: ${error.message}`);
  return (data as AnalysisJob) ?? null;
}

export async function listJobs(
  session: Session,
  limit = 20,
): Promise<AnalysisJob[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<AnalysisJob>(
      "analysis_jobs",
      (j) => j.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("analysis_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list analyses: ${error.message}`);
  return (data ?? []) as AnalysisJob[];
}

export async function createResults(
  session: Session,
  jobId: string,
  results: Omit<
    AnalysisResult,
    "id" | "job_id" | "organization_id" | "created_at"
  >[],
): Promise<AnalysisResult[]> {
  const rows: AnalysisResult[] = results.map((result) => ({
    ...result,
    id: newId(),
    job_id: jobId,
    organization_id: session.organizationId,
    created_at: nowIso(),
  }));
  if (rows.length === 0) return [];

  if (storeMode() === "local") {
    for (const row of rows) await insertLocal("analysis_results", row);
    return rows;
  }
  const client = await supabaseOrThrow();
  const { error } = await client.from("analysis_results").insert(rows);
  if (error) throw new Error(`Could not save results: ${error.message}`);
  return rows;
}

export async function listResults(
  session: Session,
  jobId: string,
): Promise<AnalysisResult[]> {
  if (storeMode() === "local") {
    return findLocal<AnalysisResult>(
      "analysis_results",
      (r) =>
        r.job_id === jobId && r.organization_id === session.organizationId,
    );
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("analysis_results")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at");
  if (error) throw new Error(`Could not load results: ${error.message}`);
  return (data ?? []) as AnalysisResult[];
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export async function saveAnomalies(
  session: Session,
  anomalies: Omit<Anomaly, "id" | "organization_id" | "created_at">[],
): Promise<Anomaly[]> {
  const rows: Anomaly[] = anomalies.map((anomaly) => ({
    ...anomaly,
    id: newId(),
    organization_id: session.organizationId,
    created_at: nowIso(),
  }));
  if (rows.length === 0) return [];

  if (storeMode() === "local") {
    for (const row of rows) await insertLocal("anomalies", row);
    return rows;
  }
  const client = await supabaseOrThrow();
  const { error } = await client.from("anomalies").insert(rows);
  if (error) throw new Error(`Could not save anomalies: ${error.message}`);
  return rows;
}

export async function listAnomalies(
  session: Session,
  limit = 50,
): Promise<Anomaly[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Anomaly>(
      "anomalies",
      (a) => a.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("anomalies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list anomalies: ${error.message}`);
  return (data ?? []) as Anomaly[];
}

export async function saveForecast(
  session: Session,
  forecast: Omit<Forecast, "id" | "organization_id" | "created_at">,
): Promise<Forecast> {
  const row: Forecast = {
    ...forecast,
    id: newId(),
    organization_id: session.organizationId,
    created_at: nowIso(),
  };
  if (storeMode() === "local") return insertLocal("forecasts", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("forecasts")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not save forecast: ${error.message}`);
  return data as Forecast;
}

export async function listForecasts(
  session: Session,
  limit = 20,
): Promise<Forecast[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Forecast>(
      "forecasts",
      (f) => f.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("forecasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list forecasts: ${error.message}`);
  return (data ?? []) as Forecast[];
}

export async function saveRecommendations(
  session: Session,
  recommendations: Omit<
    Recommendation,
    "id" | "organization_id" | "created_at"
  >[],
): Promise<Recommendation[]> {
  const rows: Recommendation[] = recommendations.map((recommendation) => ({
    ...recommendation,
    id: newId(),
    organization_id: session.organizationId,
    created_at: nowIso(),
  }));
  if (rows.length === 0) return [];

  if (storeMode() === "local") {
    for (const row of rows) await insertLocal("recommendations", row);
    return rows;
  }
  const client = await supabaseOrThrow();
  const { error } = await client.from("recommendations").insert(rows);
  if (error) {
    throw new Error(`Could not save recommendations: ${error.message}`);
  }
  return rows;
}

export async function listRecommendations(
  session: Session,
  limit = 50,
): Promise<Recommendation[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Recommendation>(
      "recommendations",
      (r) => r.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Could not list recommendations: ${error.message}`);
  }
  return (data ?? []) as Recommendation[];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function saveReport(
  session: Session,
  report: Omit<Report, "id" | "organization_id" | "created_by" | "created_at">,
): Promise<Report> {
  const row: Report = {
    ...report,
    id: newId(),
    organization_id: session.organizationId,
    created_by: session.userId,
    created_at: nowIso(),
  };
  if (storeMode() === "local") return insertLocal("reports", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("reports")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not save report: ${error.message}`);
  return data as Report;
}

export async function getReport(
  session: Session,
  id: string,
): Promise<Report | null> {
  if (storeMode() === "local") {
    const rows = await findLocal<Report>(
      "reports",
      (r) => r.id === id && r.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load report: ${error.message}`);
  return (data as Report) ?? null;
}

/**
 * How many rows exist, independent of how many were fetched to show.
 *
 * The dashboard lists the five most recent analyses and reports, and used the
 * length of those lists as the totals beside them. Both counters therefore
 * stopped at five: an account with fifty reports read "5", and the number
 * never moved again no matter how much work was done.
 *
 * Counting is a separate question from listing, so it gets its own query —
 * `head: true` fetches no rows at all, only the count, so this costs a great
 * deal less than raising the limit would.
 */
async function countRows(
  session: Session,
  table: "reports" | "analysis_jobs",
): Promise<number> {
  if (storeMode() === "local") {
    const rows = await findLocal<{ organization_id: string }>(
      table,
      (r) => r.organization_id === session.organizationId,
    );
    return rows.length;
  }
  const client = await supabaseOrThrow();
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organizationId);
  // A count that cannot be read is reported as unknown by the caller rather
  // than as zero, which would read as "you have none".
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Total analyses this workspace has run. */
export async function countJobs(session: Session): Promise<number> {
  return countRows(session, "analysis_jobs");
}

/** Total reports this workspace has generated. */
export async function countReports(session: Session): Promise<number> {
  return countRows(session, "reports");
}

export async function listReports(
  session: Session,
  limit = 50,
): Promise<Report[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Report>(
      "reports",
      (r) => r.organization_id === session.organizationId,
    );
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list reports: ${error.message}`);
  return (data ?? []) as Report[];
}

// ---------------------------------------------------------------------------
// Audit log — append-only, never readable or writable by the client directly.
// ---------------------------------------------------------------------------

export async function audit(entry: AuditEntry): Promise<void> {
  const row = {
    id: newId(),
    organization_id: entry.organization_id,
    user_id: entry.user_id,
    action: entry.action,
    resource_type: entry.resource_type ?? null,
    resource_id: entry.resource_id ?? null,
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
    metadata: entry.metadata ?? {},
    created_at: nowIso(),
  };

  try {
    if (storeMode() === "local" || !hasServiceClient()) {
      await insertLocal("audit_logs", row);
      return;
    }
    await getServiceClient().from("audit_logs").insert(row);
  } catch (error) {
    // Audit failures must never break the user-facing request, but they must
    // be visible in the server log.
    console.error("[audit] failed to record entry", entry.action, error);
  }
}

export async function readAuditLog(limit = 100) {
  if (storeMode() === "local") {
    const rows = await readCollection<Record<string, unknown>>("audit_logs");
    return rows.slice(-limit).reverse();
  }
  const client = await supabaseOrThrow();
  const { data } = await client
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Saved views
//
// A view holds tiles, and a tile holds a question rather than an answer: the
// dataset, the grouping and the summary to compute. Opening a view recomputes
// every tile from the file, so a saved screen cannot drift into showing a
// figure that was true when it was pinned and is not true now.
// ---------------------------------------------------------------------------

export async function listDashboards(session: Session): Promise<Dashboard[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<Dashboard>(
      "dashboards",
      (d) => d.organization_id === session.organizationId,
    );
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dashboards")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not list saved views: ${error.message}`);
  return (data ?? []) as Dashboard[];
}

export async function getDashboard(
  session: Session,
  id: string,
): Promise<Dashboard | null> {
  if (storeMode() === "local") {
    const rows = await findLocal<Dashboard>(
      "dashboards",
      (d) => d.id === id && d.organization_id === session.organizationId,
    );
    return rows[0] ?? null;
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dashboards")
    .select("*")
    .eq("id", id)
    // Scoped by organization as well as id: the row-level policy already does
    // this, but a query that only names an id would leak across tenants the
    // moment it ran with the service client.
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load that view: ${error.message}`);
  return (data as Dashboard) ?? null;
}

export async function createDashboard(
  session: Session,
  input: { name: string; description?: string | null },
): Promise<Dashboard> {
  const row: Dashboard = {
    id: newId(),
    organization_id: session.organizationId,
    created_by: session.userId,
    name: input.name,
    description: input.description ?? null,
    filters: {},
    is_shared: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (storeMode() === "local") return insertLocal("dashboards", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client.from("dashboards").insert(row).select().single();
  if (error) throw new Error(`Could not create the view: ${error.message}`);
  return data as Dashboard;
}

export async function renameDashboard(
  session: Session,
  id: string,
  name: string,
): Promise<void> {
  if (storeMode() === "local") {
    await updateLocal<Dashboard>("dashboards", id, { name, updated_at: nowIso() });
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("dashboards")
    .update({ name, updated_at: nowIso() })
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not rename the view: ${error.message}`);
}

export async function deleteDashboard(session: Session, id: string): Promise<void> {
  if (storeMode() === "local") {
    await deleteLocal(
      "dashboards",
      (d) => d.id === id && d.organization_id === session.organizationId,
    );
    return;
  }
  const client = await supabaseOrThrow();
  // Tiles go with it by cascade; deleting them here as well would be a second
  // round trip that the database already guarantees.
  const { error } = await client
    .from("dashboards")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not delete the view: ${error.message}`);
}

export async function listWidgets(
  session: Session,
  dashboardId: string,
): Promise<DashboardWidget[]> {
  if (storeMode() === "local") {
    const rows = await findLocal<DashboardWidget>(
      "dashboard_widgets",
      (w) =>
        w.dashboard_id === dashboardId &&
        w.organization_id === session.organizationId,
    );
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dashboard_widgets")
    .select("*")
    .eq("dashboard_id", dashboardId)
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load the tiles: ${error.message}`);
  return (data ?? []) as DashboardWidget[];
}

export async function createWidget(
  session: Session,
  input: {
    dashboard_id: string;
    widget_type: WidgetType;
    title: string | null;
    config: WidgetConfig;
  },
): Promise<DashboardWidget> {
  const row: DashboardWidget = {
    id: newId(),
    dashboard_id: input.dashboard_id,
    organization_id: session.organizationId,
    widget_type: input.widget_type,
    title: input.title,
    config: input.config,
    layout_x: 0,
    layout_y: 0,
    layout_w: 4,
    layout_h: 4,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (storeMode() === "local") return insertLocal("dashboard_widgets", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("dashboard_widgets")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`Could not add the tile: ${error.message}`);
  return data as DashboardWidget;
}

export async function deleteWidget(session: Session, id: string): Promise<void> {
  if (storeMode() === "local") {
    await deleteLocal(
      "dashboard_widgets",
      (w) => w.id === id && w.organization_id === session.organizationId,
    );
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("dashboard_widgets")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not remove the tile: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Alerts
//
// The table arrives with migration 0004. Until it is run, listing returns a
// marker saying the table is absent rather than an empty array — the screen
// then explains why it is empty instead of implying nobody has made an alert.
// ---------------------------------------------------------------------------

export type AlertListing =
  | { ok: true; alerts: Alert[] }
  | { ok: false; reason: "table_missing" | "unavailable"; detail: string };

/** True when the error means the relation does not exist yet. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist/i.test(error.message ?? "")
  );
}

export async function listAlerts(session: Session): Promise<AlertListing> {
  if (storeMode() === "local") {
    const rows = await findLocal<Alert>(
      "alerts",
      (a) => a.organization_id === session.organizationId,
    );
    return { ok: true, alerts: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }

  const client = await supabaseOrThrow();
  const { data, error } = await client
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return isMissingTable(error)
      ? { ok: false, reason: "table_missing", detail: error.message }
      : { ok: false, reason: "unavailable", detail: error.message };
  }
  return { ok: true, alerts: (data ?? []) as Alert[] };
}

export async function createAlert(
  session: Session,
  input: Pick<
    Alert,
    "dataset_id" | "name" | "group_by" | "measure" | "aggregation" | "comparison" | "threshold"
  >,
): Promise<Alert> {
  const row: Alert = {
    id: newId(),
    organization_id: session.organizationId,
    created_by: session.userId,
    dataset_id: input.dataset_id,
    name: input.name,
    group_by: input.group_by,
    measure: input.measure,
    aggregation: input.aggregation,
    comparison: input.comparison,
    threshold: input.threshold,
    is_active: true,
    last_checked_at: null,
    last_value: null,
    last_state: null,
    last_error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (storeMode() === "local") return insertLocal("alerts", row);

  const client = await supabaseOrThrow();
  const { data, error } = await client.from("alerts").insert(row).select().single();
  if (error) throw new Error(`Could not create the alert: ${error.message}`);
  return data as Alert;
}

/** Records what a check saw. Never used as the basis of the next check. */
export async function recordAlertCheck(
  session: Session,
  id: string,
  observation: Pick<Alert, "last_value" | "last_state" | "last_error">,
): Promise<void> {
  const patch = { ...observation, last_checked_at: nowIso(), updated_at: nowIso() };

  if (storeMode() === "local") {
    await updateLocal<Alert>("alerts", id, patch);
    return;
  }
  const client = await supabaseOrThrow();
  // A failure to record an observation must not break the page that made it.
  await client
    .from("alerts")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", session.organizationId);
}

export async function setAlertActive(
  session: Session,
  id: string,
  isActive: boolean,
): Promise<void> {
  if (storeMode() === "local") {
    await updateLocal<Alert>("alerts", id, { is_active: isActive, updated_at: nowIso() });
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("alerts")
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not update the alert: ${error.message}`);
}

export async function deleteAlert(session: Session, id: string): Promise<void> {
  if (storeMode() === "local") {
    await deleteLocal("alerts", (a) => a.id === id && a.organization_id === session.organizationId);
    return;
  }
  const client = await supabaseOrThrow();
  const { error } = await client
    .from("alerts")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) throw new Error(`Could not delete the alert: ${error.message}`);
}
