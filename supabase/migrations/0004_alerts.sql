-- Alerts
--
-- An alert is a saved question plus a line: "total revenue by region, tell me
-- when it drops below 50,000". It stores the question, never a number, for the
-- same reason a saved view does — a rule that carried its own copy of the data
-- would start answering about a past that no longer exists.
--
-- The last observed value IS stored, but only so the screen can say what it
-- saw and when. It is never the basis of a decision; every check recomputes
-- from the file.

create table if not exists public.alerts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete cascade,
  dataset_id       uuid not null references public.datasets(id) on delete cascade,

  name             text not null,

  -- The question, in the same shape Explore and saved-view tiles use, so all
  -- three are computed by one code path rather than three that can disagree.
  group_by         text not null,
  measure          text,
  aggregation      text not null default 'sum'
                     check (aggregation in ('sum','avg','count','min','max','median')),

  -- The line, and which side of it is worth interrupting someone for.
  comparison       text not null check (comparison in ('above','below')),
  threshold        double precision not null,

  is_active        boolean not null default true,

  -- What the last check saw. Descriptive only.
  last_checked_at  timestamptz,
  last_value       double precision,
  last_state       text check (last_state in ('ok','triggered','error')),
  last_error       text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists alerts_org_idx
  on public.alerts(organization_id, created_at desc);

create index if not exists alerts_dataset_idx
  on public.alerts(dataset_id);

drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

-- Row level security, matching every other tenant-scoped table: an account
-- sees its own workspace's rows and no others. Without this the table would be
-- readable across tenants by anyone holding an anon key.
alter table public.alerts enable row level security;

drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
  for insert with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
  for update using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts
  for delete using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );
