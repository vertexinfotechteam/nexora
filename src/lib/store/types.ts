/**
 * Domain types shared by both store drivers (Supabase and local).
 * Field names mirror the SQL schema in supabase/migrations/0001_nexora_init.sql
 * so the two drivers stay interchangeable.
 */

export type OrgRole = "owner" | "admin" | "analyst" | "viewer";

export type DatasetStatus =
  | "uploading"
  | "validating"
  | "profiling"
  | "ready"
  | "failed"
  | "archived";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type Session = {
  userId: string;
  organizationId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: OrgRole;
  organizationName: string;
  plan: "free" | "pro" | "business" | "enterprise";
  /** Which backend served this session. Surfaced in the UI, never faked. */
  mode: "supabase" | "local";
};

export type Dataset = {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  status: DatasetStatus;
  file_type: string | null;
  row_count: number | null;
  column_count: number | null;
  size_bytes: number | null;
  quality_score: number | null;
  last_analyzed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DatasetFile = {
  id: string;
  dataset_id: string;
  organization_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  checksum_sha256: string | null;
  scan_status: "pending" | "clean" | "rejected";
  scan_detail: string | null;
  created_at: string;
};

/** Broad semantic role inferred from the data, used to pick charts and metrics. */
export type SemanticType =
  | "date"
  | "measure"
  | "dimension"
  | "identifier"
  | "boolean"
  | "text";

export type DatasetColumn = {
  id: string;
  dataset_id: string;
  organization_id: string;
  position: number;
  name: string;
  normalized_name: string;
  data_type: string;
  semantic_type: SemanticType;
  nullable: boolean;
};

export type ColumnIssue = {
  code:
    | "missing_values"
    | "empty_column"
    | "constant_column"
    | "high_cardinality"
    | "outliers"
    | "invalid_dates"
    | "mixed_types"
    | "inconsistent_categories";
  severity: "low" | "medium" | "high";
  detail: string;
  /** Rows affected — always a counted value, never estimated by an AI. */
  affected: number;
};

export type DatasetProfile = {
  id: string;
  dataset_id: string;
  organization_id: string;
  column_name: string;
  null_count: number;
  distinct_count: number | null;
  min_value: string | null;
  max_value: string | null;
  mean_value: number | null;
  median_value: number | null;
  stddev_value: number | null;
  p25_value: number | null;
  p75_value: number | null;
  outlier_count: number | null;
  top_values: { value: string; count: number }[] | null;
  issues: ColumnIssue[];
};

export type DatasetQuality = {
  score: number;
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  missingCells: number;
  totalCells: number;
  emptyColumns: number;
  constantColumns: number;
  issues: (ColumnIssue & { column: string })[];
};

/** One entry in the live activity stream. */
export type ActivityStep = {
  id: string;
  /** Machine-readable stage, used for icon and colour selection. */
  stage:
    | "queued"
    | "understanding"
    | "schema"
    | "planning"
    | "tool"
    | "sql"
    | "validating"
    | "executing"
    | "computing"
    | "charting"
    | "explaining"
    | "saving"
    | "done"
    | "error";
  /** Plain-language line shown to the user. No jargon. */
  label: string;
  /** Optional supporting detail — real numbers only. */
  detail?: string;
  status: "running" | "ok" | "warn" | "error";
  startedAt: number;
  durationMs?: number;
  /** Verified figures produced by this step, for the "show your work" panel. */
  facts?: { label: string; value: string }[];
  sql?: string;
};

export type ChartSpec = {
  type: "line" | "bar" | "histogram" | "scatter" | "donut" | "heatmap" | "table";
  title: string;
  xKey: string;
  yKeys: string[];
  seriesKey?: string;
  xLabel?: string;
  yLabel?: string;
  /** Formatting hint so the UI renders currency/percent correctly. */
  valueFormat?: "number" | "currency" | "percent";
  reason: string;
};

export type AnalysisResult = {
  id: string;
  job_id: string;
  organization_id: string;
  kind:
    | "table"
    | "chart"
    | "kpi"
    | "anomaly"
    | "forecast"
    | "recommendation"
    | "insight";
  title: string | null;
  summary: string | null;
  sql_text: string | null;
  row_count: number | null;
  columns: { name: string; type: string }[] | null;
  rows: Record<string, unknown>[] | null;
  chart: ChartSpec | null;
  /** Engine-computed figures. The narrative may only cite values from here. */
  numbers: Record<string, number | string>;
  created_at: string;
};

export type AnalysisJob = {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  user_id: string;
  question: string;
  status: JobStatus;
  provider: string | null;
  model: string | null;
  steps: ActivityStep[];
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export type Anomaly = {
  id: string;
  organization_id: string;
  dataset_id: string;
  job_id: string | null;
  metric: string;
  dimension: string | null;
  occurred_on: string | null;
  actual_value: number;
  expected_value: number | null;
  deviation_pct: number | null;
  z_score: number | null;
  severity: "low" | "medium" | "high" | "critical";
  direction: "spike" | "drop" | "shift" | null;
  method: string;
  confidence: number | null;
  explanation: string | null;
  created_at: string;
};

export type ForecastPoint = {
  period: string;
  value: number;
  lower: number;
  upper: number;
};

export type Forecast = {
  id: string;
  organization_id: string;
  dataset_id: string;
  job_id: string | null;
  metric: string;
  horizon: number;
  granularity: string;
  model: string;
  mape: number | null;
  /** How `mape` was measured. Displayed verbatim so it is never overstated. */
  accuracy_basis: "backtest" | "in-sample" | "none";
  history: { period: string; value: number }[];
  points: ForecastPoint[];
  data_quality_note: string | null;
  created_at: string;
};

export type Recommendation = {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  job_id: string | null;
  title: string;
  body: string;
  /** Each item must trace back to a computed figure. */
  evidence: { label: string; value: string }[];
  impact: string | null;
  confidence: number | null;
  status: "open" | "accepted" | "dismissed";
  created_at: string;
};

export type ReportPayload = {
  title: string;
  question: string;
  datasetName: string;
  generatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  executiveSummary: string;
  kpis: { label: string; value: string; change?: string; direction?: "up" | "down" }[];
  charts: {
    spec: ChartSpec;
    rows: Record<string, unknown>[];
  }[];
  insights: { title: string; body: string; evidence: { label: string; value: string }[] }[];
  anomalies: Anomaly[];
  forecasts: Forecast[];
  recommendations: Recommendation[];
  quality: DatasetQuality | null;
  provider: string | null;
  model: string | null;
  steps: ActivityStep[];
};

export type Report = {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  job_id: string | null;
  created_by: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  payload: ReportPayload;
  created_at: string;
};

export type AuditEntry = {
  organization_id: string | null;
  user_id: string | null;
  action: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
};

/**
 * A saved view: a named screen holding tiles the user pinned.
 *
 * The tables behind these have existed since the first migration; nothing new
 * is needed to store one.
 */
export type Dashboard = {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

/** Chart shapes a tile may take. Matches the column's check constraint. */
export type WidgetType = "kpi" | "line" | "bar" | "donut" | "table";

/**
 * What a tile needs to recompute itself.
 *
 * Deliberately a saved *question*, not a saved answer: the numbers are worked
 * out from the file each time the view is opened, so a tile can never show a
 * figure that was true last month and is not true now.
 */
export type WidgetConfig = {
  datasetId: string;
  groupBy: string;
  measure: string | null;
  aggregation: string;
  sort: "value_desc" | "value_asc" | "label_asc";
  limit: number;
};

export type DashboardWidget = {
  id: string;
  dashboard_id: string;
  organization_id: string;
  widget_type: WidgetType;
  title: string | null;
  config: WidgetConfig;
  layout_x: number;
  layout_y: number;
  layout_w: number;
  layout_h: number;
  created_at: string;
  updated_at: string;
};

/**
 * An alert: a saved question plus a line worth being told about.
 *
 * Like a saved-view tile it stores the question, not a number. `last_value` is
 * kept only so the screen can say what the previous check saw; every check
 * recomputes from the file rather than trusting it.
 */
export type Alert = {
  id: string;
  organization_id: string;
  created_by: string;
  dataset_id: string;
  name: string;
  group_by: string;
  measure: string | null;
  aggregation: string;
  comparison: "above" | "below";
  threshold: number;
  is_active: boolean;
  last_checked_at: string | null;
  last_value: number | null;
  last_state: "ok" | "triggered" | "error" | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
