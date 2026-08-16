-- Platform administration.
--
-- Everything here is platform-scoped, not workspace-scoped, and that
-- distinction is the whole design. Signing up makes you the owner of your own
-- workspace, so "is an owner" is true for every user in the system and is
-- useless as an administrative gate. These tables describe the people who
-- operate Nexus itself, and the records they need to do it.
--
-- No table below carries a select policy. Reads are denied to anon and
-- authenticated alike, and the admin panel reaches them with the service key
-- behind an explicit role check. Do not add a select policy for org owners.

-- =============================================================================
-- STAFF AND ROLES
-- =============================================================================

do $$ begin
  create type platform_role as enum (
    'super_admin',  -- everything, including managing other staff
    'admin',        -- everything except staff management and destructive data ops
    'manager',      -- read everything, act on billing and content
    'support'       -- read users and tickets, answer tickets, no billing
  );
exception when duplicate_object then null; end $$;

create table if not exists public.platform_staff (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  email        text not null,
  role         platform_role not null default 'support',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists platform_staff_email_idx on public.platform_staff (lower(email));

-- =============================================================================
-- SECURITY
-- =============================================================================

/* One row per sign-in, so an admin can see where an account is being used and
   end a session that should not be running. */
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ip_address    inet,
  user_agent    text,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Set when an admin (or the user) ends the session early.
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users(id) on delete set null
);

create index if not exists user_sessions_user_idx
  on public.user_sessions (user_id, last_seen_at desc);

/* Every attempt, successful or not. Failures are what make a brute-force
   attempt visible; recording only successes would hide exactly the pattern
   worth seeing. */
create table if not exists public.login_attempts (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  user_id      uuid references auth.users(id) on delete set null,
  succeeded    boolean not null,
  reason       text,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists login_attempts_created_idx
  on public.login_attempts (created_at desc);
create index if not exists login_attempts_email_idx
  on public.login_attempts (lower(email), created_at desc);
create index if not exists login_attempts_ip_idx
  on public.login_attempts (ip_address, created_at desc);

-- =============================================================================
-- SUPPORT
-- =============================================================================

create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  -- Null when raised by someone with no account, via the contact form.
  user_id       uuid references auth.users(id) on delete set null,
  email         text not null,
  name          text,
  subject       text not null,
  status        text not null default 'open'
                check (status in ('open', 'pending', 'resolved', 'closed')),
  priority      text not null default 'normal'
                check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, priority, created_at desc);

create table if not exists public.support_ticket_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  -- "customer" or "staff": who the message is from, independent of account.
  author_kind  text not null check (author_kind in ('customer', 'staff')),
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at);

-- =============================================================================
-- BILLING
-- =============================================================================

/* Payment records mirrored from Razorpay.
   Amounts are integer minor units (paise), never floats — the same rule the
   document engine follows, for the same reason. */
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid references public.organizations(id) on delete set null,
  user_id              uuid references auth.users(id) on delete set null,
  provider             text not null default 'razorpay',
  provider_payment_id  text unique,
  provider_order_id    text,
  amount_minor         bigint not null,
  currency             text not null default 'INR',
  status               text not null
                       check (status in ('created','authorized','captured','refunded','failed')),
  method               text,
  failure_reason       text,
  refunded_minor       bigint not null default 0,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists payments_created_idx on public.payments (created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
create index if not exists payments_org_idx on public.payments (organization_id, created_at desc);

-- =============================================================================
-- SYSTEM MANAGEMENT
-- =============================================================================

/* Feature flags and application settings.
   Kept as two tables rather than one so a boolean rollout cannot be confused
   with a configuration value that happens to be true. */
create table if not exists public.feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  description  text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create table if not exists public.app_settings (
  key          text primary key,
  value        jsonb not null default '{}'::jsonb,
  description  text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

/* Suspension is a soft state, not a deletion: an account that is banned in
   error must be recoverable, and its data must survive the mistake. */
create table if not exists public.user_status (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  state        text not null default 'active'
               check (state in ('active', 'suspended', 'banned')),
  reason       text,
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.platform_staff         enable row level security;
alter table public.user_sessions          enable row level security;
alter table public.login_attempts         enable row level security;
alter table public.support_tickets        enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.payments               enable row level security;
alter table public.feature_flags          enable row level security;
alter table public.app_settings           enable row level security;
alter table public.user_status            enable row level security;

/* A user may see their own sessions, so "where am I signed in?" does not
   require staff. Nothing else here is readable without the service key. */
drop policy if exists user_sessions_select_self on public.user_sessions;
create policy user_sessions_select_self on public.user_sessions
  for select using (user_id = auth.uid());

/* Anyone may open a ticket about their own account. */
drop policy if exists support_tickets_insert_self on public.support_tickets;
create policy support_tickets_insert_self on public.support_tickets
  for insert with check (user_id = auth.uid() or user_id is null);

drop policy if exists support_tickets_select_self on public.support_tickets;
create policy support_tickets_select_self on public.support_tickets
  for select using (user_id = auth.uid());

/* Feature flags are read by the application for the signed-in user; the values
   are not secret and the app needs them to render. Writes stay staff-only. */
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all on public.feature_flags
  for select using (true);
