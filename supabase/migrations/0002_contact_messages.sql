-- Contact messages from the public landing page.
--
-- These come from anonymous visitors, so they belong to the platform rather
-- than to any customer workspace: there is deliberately no organization_id to
-- scope them by.
--
-- That makes the read policy the important part. Every person who signs up
-- becomes the owner of their own workspace, so "is an owner/admin" is true for
-- every user in the system and would be a useless gate here — it would let any
-- customer read the name, email and message of every visitor who ever used the
-- form. Reads are therefore denied to everyone at the RLS layer, and the admin
-- panel fetches them with the service key behind an explicit staff allowlist.

create table if not exists public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (length(trim(name)) between 1 and 120),
  email         text        not null check (length(trim(email)) between 3 and 254),
  subject       text        not null check (length(trim(subject)) between 1 and 160),
  message       text        not null check (length(trim(message)) between 1 and 4000),

  -- Set when a signed-in user writes in, so support can open their account.
  user_id       uuid        references auth.users(id) on delete set null,

  -- Triage state, driven from the admin panel.
  status        text        not null default 'new'
                            check (status in ('new', 'read', 'replied', 'archived')),

  -- Context captured server-side. Never trusted from the form body.
  source_path   text,
  user_agent    text,

  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid        references auth.users(id) on delete set null
);

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

/* Anyone may write in — that is the entire point of a public contact form.
   The column checks above bound what an anonymous caller can store. */
drop policy if exists contact_messages_insert_anyone on public.contact_messages;
create policy contact_messages_insert_anyone on public.contact_messages
  for insert with check (true);

/* No select/update/delete policy exists, so with RLS on, every read is denied
   to anon and authenticated alike. The service key bypasses RLS and is the
   only path to these rows; see isPlatformStaff() for the gate in front of it.
   This is intentional — do not add a select policy for org owners. */
