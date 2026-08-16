-- =============================================================================
-- NEXORA AI — initial schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- Design rules:
--   * Every tenant-scoped table carries organization_id and is protected by RLS.
--   * Membership is resolved through SECURITY DEFINER helper functions so the
--     policies never recurse through organization_members.
--   * Nothing here stores passwords — Supabase Auth owns credentials entirely.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type org_role as enum ('owner', 'admin', 'analyst', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dataset_status as enum
    ('uploading', 'validating', 'profiling', 'ready', 'failed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum
    ('queued', 'running', 'succeeded', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_tier as enum ('free', 'pro', 'business', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type anomaly_severity as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- IDENTITY
-- =============================================================================

create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  username      citext not null unique,
  display_name  text,
  avatar_url    text,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,32}$')
);

create index if not exists profiles_user_id_idx on public.profiles(user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  slug        citext not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  plan        plan_tier not null default 'free',
  created_by  uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             org_role not null default 'viewer',
  invited_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists org_members_user_idx on public.organization_members(user_id);
create index if not exists org_members_org_idx  on public.organization_members(organization_id);

drop trigger if exists org_members_set_updated_at on public.organization_members;
create trigger org_members_set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Membership helpers.
-- SECURITY DEFINER + search_path pinning: these read organization_members
-- without re-entering RLS, which is what prevents infinite policy recursion.
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role_of(org uuid)
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.organization_members m
  where m.organization_id = org and m.user_id = auth.uid();
$$;

/* Can the current user change data (not just read) inside this org? */
create or replace function public.can_write_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(org) in ('owner', 'admin', 'analyst');
$$;

create or replace function public.can_admin_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(org) in ('owner', 'admin');
$$;

-- =============================================================================
-- DATA MANAGEMENT
-- =============================================================================

create table if not exists public.datasets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  owner_id            uuid not null references auth.users(id) on delete restrict,
  name                text not null check (char_length(name) between 1 and 200),
  description         text,
  status              dataset_status not null default 'uploading',
  source_type         text not null default 'upload',
  file_type           text,
  row_count           bigint,
  column_count        integer,
  size_bytes          bigint,
  quality_score       numeric(5,2) check (quality_score between 0 and 100),
  last_analyzed_at    timestamptz,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists datasets_org_idx     on public.datasets(organization_id, created_at desc);
create index if not exists datasets_owner_idx   on public.datasets(owner_id);
create index if not exists datasets_status_idx  on public.datasets(organization_id, status);

drop trigger if exists datasets_set_updated_at on public.datasets;
create trigger datasets_set_updated_at before update on public.datasets
  for each row execute function public.set_updated_at();

create table if not exists public.dataset_files (
  id               uuid primary key default gen_random_uuid(),
  dataset_id       uuid not null references public.datasets(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  storage_path     text not null,
  original_name    text not null,
  mime_type        text,
  size_bytes       bigint not null check (size_bytes >= 0),
  checksum_sha256  text,
  scan_status      text not null default 'pending'
                     check (scan_status in ('pending','clean','rejected')),
  scan_detail      text,
  created_at       timestamptz not null default now()
);

create index if not exists dataset_files_dataset_idx on public.dataset_files(dataset_id);

create table if not exists public.dataset_columns (
  id               uuid primary key default gen_random_uuid(),
  dataset_id       uuid not null references public.datasets(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  position         integer not null,
  name             text not null,
  normalized_name  text not null,
  data_type        text not null,
  semantic_type    text,
  nullable         boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (dataset_id, position)
);

create index if not exists dataset_columns_dataset_idx on public.dataset_columns(dataset_id);

/* One row per column holding the computed profile (never AI-generated). */
create table if not exists public.dataset_profiles (
  id                 uuid primary key default gen_random_uuid(),
  dataset_id         uuid not null references public.datasets(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  column_id          uuid references public.dataset_columns(id) on delete cascade,
  column_name        text not null,
  null_count         bigint not null default 0,
  distinct_count     bigint,
  min_value          text,
  max_value          text,
  mean_value         double precision,
  median_value       double precision,
  stddev_value       double precision,
  p25_value          double precision,
  p75_value          double precision,
  outlier_count      bigint,
  top_values         jsonb,
  issues             jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  unique (dataset_id, column_name)
);

create index if not exists dataset_profiles_dataset_idx on public.dataset_profiles(dataset_id);

-- =============================================================================
-- ANALYSIS
-- =============================================================================

create table if not exists public.analysis_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  dataset_id       uuid references public.datasets(id) on delete set null,
  title            text not null default 'New analysis',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists analysis_sessions_org_idx
  on public.analysis_sessions(organization_id, updated_at desc);

drop trigger if exists analysis_sessions_set_updated_at on public.analysis_sessions;
create trigger analysis_sessions_set_updated_at before update on public.analysis_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.analysis_messages (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.analysis_sessions(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             text not null check (role in ('user','assistant','system','tool')),
  content          text,
  tool_name        text,
  tool_payload     jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists analysis_messages_session_idx
  on public.analysis_messages(session_id, created_at);

create table if not exists public.analysis_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  session_id       uuid references public.analysis_sessions(id) on delete cascade,
  dataset_id       uuid references public.datasets(id) on delete set null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  question         text not null,
  status           job_status not null default 'queued',
  provider         text,
  model            text,
  steps            jsonb not null default '[]'::jsonb,
  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists analysis_jobs_org_idx
  on public.analysis_jobs(organization_id, created_at desc);
create index if not exists analysis_jobs_status_idx
  on public.analysis_jobs(organization_id, status);

drop trigger if exists analysis_jobs_set_updated_at on public.analysis_jobs;
create trigger analysis_jobs_set_updated_at before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

/* Verified computation output. `numbers` holds engine-computed values only. */
create table if not exists public.analysis_results (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.analysis_jobs(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null,
  title            text,
  summary          text,
  sql_text         text,
  row_count        integer,
  columns          jsonb,
  rows             jsonb,
  chart            jsonb,
  numbers          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists analysis_results_job_idx on public.analysis_results(job_id);

-- =============================================================================
-- INSIGHTS
-- =============================================================================

create table if not exists public.anomalies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  dataset_id         uuid not null references public.datasets(id) on delete cascade,
  job_id             uuid references public.analysis_jobs(id) on delete set null,
  metric             text not null,
  dimension          text,
  occurred_on        date,
  actual_value       double precision not null,
  expected_value     double precision,
  deviation_pct      double precision,
  z_score            double precision,
  severity           anomaly_severity not null default 'low',
  direction          text check (direction in ('spike','drop','shift')),
  method             text not null,
  confidence         numeric(5,2) check (confidence between 0 and 100),
  explanation        text,
  created_at         timestamptz not null default now()
);

create index if not exists anomalies_org_idx
  on public.anomalies(organization_id, occurred_on desc);
create index if not exists anomalies_dataset_idx on public.anomalies(dataset_id);

create table if not exists public.forecasts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  dataset_id         uuid not null references public.datasets(id) on delete cascade,
  job_id             uuid references public.analysis_jobs(id) on delete set null,
  metric             text not null,
  horizon            integer not null check (horizon > 0),
  granularity        text not null default 'month',
  model              text not null,
  mape               double precision,
  /* How mape was measured. Out-of-sample backtest is trustworthy; in-sample
     flatters the model, so the two must never be reported as the same thing. */
  accuracy_basis     text not null default 'none'
                       check (accuracy_basis in ('backtest','in-sample','none')),
  history            jsonb not null,
  points             jsonb not null,
  data_quality_note  text,
  created_at         timestamptz not null default now()
);

create index if not exists forecasts_org_idx on public.forecasts(organization_id, created_at desc);

create table if not exists public.recommendations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  dataset_id         uuid references public.datasets(id) on delete cascade,
  job_id             uuid references public.analysis_jobs(id) on delete set null,
  title              text not null,
  body               text not null,
  evidence           jsonb not null default '[]'::jsonb,
  impact             text,
  confidence         numeric(5,2) check (confidence between 0 and 100),
  status             text not null default 'open'
                       check (status in ('open','accepted','dismissed')),
  created_at         timestamptz not null default now()
);

create index if not exists recommendations_org_idx
  on public.recommendations(organization_id, created_at desc);

-- =============================================================================
-- DASHBOARDS & REPORTS
-- =============================================================================

create table if not exists public.dashboards (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete restrict,
  name             text not null,
  description      text,
  filters          jsonb not null default '{}'::jsonb,
  is_shared        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dashboards_org_idx on public.dashboards(organization_id, updated_at desc);

drop trigger if exists dashboards_set_updated_at on public.dashboards;
create trigger dashboards_set_updated_at before update on public.dashboards
  for each row execute function public.set_updated_at();

create table if not exists public.dashboard_widgets (
  id               uuid primary key default gen_random_uuid(),
  dashboard_id     uuid not null references public.dashboards(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  widget_type      text not null
                     check (widget_type in
                       ('kpi','line','bar','donut','table','insight','anomaly','forecast')),
  title            text,
  config           jsonb not null default '{}'::jsonb,
  layout_x         integer not null default 0,
  layout_y         integer not null default 0,
  layout_w         integer not null default 4,
  layout_h         integer not null default 4,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dashboard_widgets_dashboard_idx
  on public.dashboard_widgets(dashboard_id);

drop trigger if exists dashboard_widgets_set_updated_at on public.dashboard_widgets;
create trigger dashboard_widgets_set_updated_at before update on public.dashboard_widgets
  for each row execute function public.set_updated_at();

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  dataset_id       uuid references public.datasets(id) on delete set null,
  job_id           uuid references public.analysis_jobs(id) on delete set null,
  created_by       uuid not null references auth.users(id) on delete restrict,
  title            text not null,
  period_start     date,
  period_end       date,
  payload          jsonb not null,
  storage_path     text,
  created_at       timestamptz not null default now()
);

create index if not exists reports_org_idx on public.reports(organization_id, created_at desc);

-- =============================================================================
-- PLATFORM
-- =============================================================================

create table if not exists public.usage_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  kind             text not null,
  quantity         numeric not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  occurred_at      timestamptz not null default now()
);

create index if not exists usage_events_org_idx
  on public.usage_events(organization_id, occurred_at desc);
create index if not exists usage_events_kind_idx
  on public.usage_events(organization_id, kind, occurred_at desc);

create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null unique references public.organizations(id) on delete cascade,
  plan                  plan_tier not null default 'free',
  status                text not null default 'active',
  external_customer_id  text,
  external_sub_id       text,
  current_period_end    timestamptz,
  limits                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

/* Logo and signature embedded into exported PDF and Excel reports.
   Stored as data URLs because they are small and read on every export. */
create table if not exists public.report_branding (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,
  business_name         text,
  logo_data_url         text,
  signature_data_url    text,
  signatory_name        text,
  signatory_title       text,
  updated_at            timestamptz not null default now(),
  constraint report_branding_logo_size check (
    logo_data_url is null or char_length(logo_data_url) <= 600000
  ),
  constraint report_branding_signature_size check (
    signature_data_url is null or char_length(signature_data_url) <= 600000
  )
);

/* Quotations, invoices, estimates and receipts built in the Data Studio.
   The editable body is one JSON column: it is a document, not a reporting
   table, and nothing queries inside it. Totals are never stored — they are
   recomputed from the line items on every render and export, so a document can
   never be saved with a total that disagrees with its own rows. */
create table if not exists public.business_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete restrict,
  kind             text not null
                     check (kind in ('quotation','invoice','estimate','receipt')),
  reference        text not null,
  title            text,
  issue_date       date,
  currency         text not null default 'INR',
  payload          jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, reference)
);

create index if not exists business_documents_org_idx
  on public.business_documents(organization_id, updated_at desc);

drop trigger if exists business_documents_set_updated_at on public.business_documents;
create trigger business_documents_set_updated_at before update on public.business_documents
  for each row execute function public.set_updated_at();

create table if not exists public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  action           text not null,
  resource_type    text,
  resource_id      text,
  ip_address       inet,
  user_agent       text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action, created_at desc);

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  body             text,
  level            text not null default 'info' check (level in ('info','success','warning','error')),
  read_at          timestamptz,
  link             text,
  created_at       timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.datasets             enable row level security;
alter table public.dataset_files        enable row level security;
alter table public.dataset_columns      enable row level security;
alter table public.dataset_profiles     enable row level security;
alter table public.analysis_sessions    enable row level security;
alter table public.analysis_messages    enable row level security;
alter table public.analysis_jobs        enable row level security;
alter table public.analysis_results     enable row level security;
alter table public.anomalies            enable row level security;
alter table public.forecasts            enable row level security;
alter table public.recommendations      enable row level security;
alter table public.dashboards           enable row level security;
alter table public.dashboard_widgets    enable row level security;
alter table public.reports              enable row level security;
alter table public.usage_events         enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.notifications        enable row level security;
alter table public.report_branding      enable row level security;
alter table public.business_documents   enable row level security;

-- report_branding: any member may read it (every report shows it);
-- only owners and admins may change how the company is represented.
drop policy if exists report_branding_select on public.report_branding;
create policy report_branding_select on public.report_branding
  for select using (public.is_org_member(organization_id));

drop policy if exists report_branding_write on public.report_branding;
create policy report_branding_write on public.report_branding
  for all using (public.can_admin_org(organization_id))
  with check (public.can_admin_org(organization_id));

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (user_id = auth.uid());

/* Teammates can see each other's profile card (name/avatar), nothing more. */
drop policy if exists profiles_select_teammates on public.profiles;
create policy profiles_select_teammates on public.profiles
  for select using (
    exists (
      select 1
      from public.organization_members me
      join public.organization_members them
        on them.organization_id = me.organization_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.user_id
    )
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- organizations --------------------------------------------------------------
/* Members can read their organization — and so can whoever created it.
   Without the created_by arm there is a chicken-and-egg at sign-up: the
   creator is not a member until the membership row exists, so any statement
   that returns the new organization row (an INSERT ... RETURNING, which is
   what PostgREST issues for .insert().select()) is rejected with 42501 even
   though the insert itself was allowed. */
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (public.is_org_member(id) or created_by = auth.uid());

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert with check (created_by = auth.uid());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update using (public.can_admin_org(id)) with check (public.can_admin_org(id));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete using (public.org_role_of(id) = 'owner');

-- organization_members -------------------------------------------------------
drop policy if exists org_members_select on public.organization_members;
create policy org_members_select on public.organization_members
  for select using (user_id = auth.uid() or public.is_org_member(organization_id));

/* Bootstrap case: the org creator inserts their own owner row. */
drop policy if exists org_members_insert on public.organization_members;
create policy org_members_insert on public.organization_members
  for insert with check (
    public.can_admin_org(organization_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id and o.created_by = auth.uid()
      )
    )
  );

drop policy if exists org_members_update on public.organization_members;
create policy org_members_update on public.organization_members
  for update using (public.can_admin_org(organization_id))
  with check (public.can_admin_org(organization_id));

drop policy if exists org_members_delete on public.organization_members;
create policy org_members_delete on public.organization_members
  for delete using (public.can_admin_org(organization_id) or user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Tenant tables. Read = any member; write = analyst and above.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  read_write_tables text[] := array[
    'datasets','dataset_files','dataset_columns','dataset_profiles',
    'analysis_sessions','analysis_messages','analysis_jobs','analysis_results',
    'anomalies','forecasts','recommendations',
    'dashboards','dashboard_widgets','reports',
    'business_documents'
  ];
begin
  foreach t in array read_write_tables loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_org_member(organization_id))',
      t, t);

    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.can_write_org(organization_id))',
      t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id))',
      t, t);

    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.can_write_org(organization_id))',
      t, t);
  end loop;
end $$;

-- usage_events / subscriptions / audit_logs are read-only to clients.
-- They are written exclusively by the server using the service-role key.
drop policy if exists usage_events_select on public.usage_events;
create policy usage_events_select on public.usage_events
  for select using (public.is_org_member(organization_id));

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (public.is_org_member(organization_id));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (public.can_admin_org(organization_id));

-- notifications --------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- USERNAME LOGIN SUPPORT
-- Resolves username -> email for the login form. Deliberately returns NULL for
-- unknown usernames so the caller cannot enumerate which accounts exist; the
-- API layer always answers with the same generic error either way.
-- =============================================================================
create or replace function public.email_for_username(p_username citext)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.username = p_username;
$$;

revoke all on function public.email_for_username(citext) from public, anon, authenticated;
-- Only the server (service_role) may call it.
grant execute on function public.email_for_username(citext) to service_role;

create or replace function public.username_available(p_username citext)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles p where p.username = p_username);
$$;

revoke all on function public.username_available(citext) from public, anon, authenticated;
grant execute on function public.username_available(citext) to service_role;

-- =============================================================================
-- PRIVATE STORAGE BUCKET
-- Layout: organization_id/user_id/dataset_id/<file>
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', false)
on conflict (id) do update set public = false;

drop policy if exists datasets_bucket_read on storage.objects;
create policy datasets_bucket_read on storage.objects
  for select using (
    bucket_id = 'datasets'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists datasets_bucket_insert on storage.objects;
create policy datasets_bucket_insert on storage.objects
  for insert with check (
    bucket_id = 'datasets'
    and public.can_write_org(((storage.foldername(name))[1])::uuid)
    and ((storage.foldername(name))[2])::uuid = auth.uid()
  );

drop policy if exists datasets_bucket_delete on storage.objects;
create policy datasets_bucket_delete on storage.objects
  for delete using (
    bucket_id = 'datasets'
    and public.can_write_org(((storage.foldername(name))[1])::uuid)
  );
