-- Multi-tenant Meld: accounts, workspaces (companies), members, channels and invites.
-- Every content table gets a workspace_id; everything that existed before becomes the
-- "northwind" sample workspace. Same access model as before: RLS on, no policies, so
-- only the server (service role) reads or writes; the app enforces membership and roles.

-- ---------------------------------------------------------------- accounts and workspaces

create table if not exists public.profiles (
  id          text primary key,             -- auth.users.id (uuid as text), or a demo id like 'aiko'
  name        text not null,
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.workspaces (
  id            text primary key,
  name          text not null,
  slug          text not null unique,
  ticket_prefix text not null,
  ticket_seq    integer not null default 0,  -- last ticket number used
  repo          text,                        -- default GitHub repo for PR links
  teams         jsonb not null default '[]', -- [{id, name}]
  demo          boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  user_id      text not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('owner', 'member', 'guest')),
  team         text,
  title        text,
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user on public.workspace_members (user_id);

create table if not exists public.channels (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  kind         text not null check (kind in ('channel', 'dm')),
  name         text,                         -- channels only
  topic        text not null default '',
  team         text,
  members      text[],                       -- DMs only: the two people (one may be 'atlas')
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists channels_workspace on public.channels (workspace_id);
create unique index if not exists channels_name on public.channels (workspace_id, name) where kind = 'channel';

create table if not exists public.invites (
  token        text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  role         text not null check (role in ('owner', 'member', 'guest')),
  created_by   text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked      boolean not null default false
);
create index if not exists invites_workspace on public.invites (workspace_id);

-- ---------------------------------------------------------------- the sample workspace

insert into public.workspaces (id, name, slug, ticket_prefix, ticket_seq, repo, teams, demo, created_by)
values (
  'northwind', 'Northwind', 'northwind', 'NW',
  (select case when is_called then last_value else last_value - 1 end from public.ticket_number),
  'northwind/web',
  '[{"id":"design","name":"Design"},{"id":"payments","name":"Payments"},{"id":"platform","name":"Platform"}]',
  true, 'me'
) on conflict (id) do nothing;

insert into public.profiles (id, name) values
  ('me', 'Suvra Das'), ('aiko', 'Aiko Tanaka'), ('ravi', 'Ravi Menon'), ('lena', 'Lena Park'), ('diego', 'Diego Alvarez')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role, team, title) values
  ('northwind', 'me', 'owner', 'design', 'Founder'),
  ('northwind', 'aiko', 'member', 'design', 'Product designer'),
  ('northwind', 'ravi', 'member', 'payments', 'Engineer'),
  ('northwind', 'lena', 'member', 'payments', 'Engineer'),
  ('northwind', 'diego', 'member', 'platform', 'Engineer')
on conflict do nothing;

insert into public.channels (id, workspace_id, kind, name, topic, team, members, created_by, created_at) values
  ('general',  'northwind', 'channel', 'general',        'Company-wide announcements',            null,       null,               'me', '2026-10-28 09:00:00+00'),
  ('design',   'northwind', 'channel', 'product-design', 'Design reviews, specs and prototypes',  'design',   null,               'me', '2026-10-28 09:00:01+00'),
  ('payments', 'northwind', 'channel', 'payments',       'Checkout, billing and payment providers', 'payments', null,             'me', '2026-10-28 09:00:02+00'),
  ('platform', 'northwind', 'channel', 'platform-eng',   'Infra, CI and internal APIs',           'platform', null,               'me', '2026-10-28 09:00:03+00'),
  ('aiko',     'northwind', 'dm',      null,             'Product designer · Design',             null,       '{me,aiko}',        'me', '2026-10-28 09:00:04+00'),
  ('ravi',     'northwind', 'dm',      null,             'Engineer · Payments',                   null,       '{me,ravi}',        'me', '2026-10-28 09:00:05+00'),
  ('atlas',    'northwind', 'dm',      null,             'Agent · works on tickets with your permissions', null, '{me,atlas}',    'me', '2026-10-28 09:00:06+00')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- scope content by workspace

alter table public.tickets       add column if not exists workspace_id text not null default 'northwind' references public.workspaces (id) on delete cascade;
alter table public.messages      add column if not exists workspace_id text not null default 'northwind' references public.workspaces (id) on delete cascade;
alter table public.events        add column if not exists workspace_id text not null default 'northwind';
alter table public.agent_actions add column if not exists workspace_id text not null default 'northwind';
alter table public.agent_runs    add column if not exists workspace_id text not null default 'northwind';
alter table public.agent_runs    add column if not exists requester text not null default 'me';
alter table public.week_activity add column if not exists workspace_id text not null default 'northwind';

-- New rows must say which workspace they belong to.
alter table public.tickets       alter column workspace_id drop default;
alter table public.messages      alter column workspace_id drop default;
alter table public.events        alter column workspace_id drop default;
alter table public.agent_actions alter column workspace_id drop default;
alter table public.agent_runs    alter column workspace_id drop default;
alter table public.agent_runs    alter column requester drop default;
alter table public.week_activity alter column workspace_id drop default;

-- Ticket ids (NW-121) are unique per workspace, and teams are per workspace.
alter table public.tickets drop constraint if exists tickets_pkey;
alter table public.tickets add primary key (workspace_id, id);
alter table public.tickets drop constraint if exists tickets_team_check;

alter table public.week_activity drop constraint if exists week_activity_pkey;
alter table public.week_activity add primary key (workspace_id, day);

create index if not exists messages_ws_chat_seq on public.messages (workspace_id, chat_id, seq);
create index if not exists agent_actions_ws on public.agent_actions (workspace_id, chat_id);
create index if not exists agent_runs_ws_active on public.agent_runs (workspace_id, created_at) where status in ('queued', 'running');

-- ---------------------------------------------------------------- per-workspace functions

drop function if exists public.next_ticket_id();
create or replace function public.next_ticket_id(p_ws text) returns text
language sql security definer set search_path = public as $$
  update public.workspaces set ticket_seq = ticket_seq + 1 where id = p_ws
  returning ticket_prefix || '-' || ticket_seq::text
$$;

drop function if exists public.bump_week(integer, boolean);
create or replace function public.bump_week(p_ws text, p_day integer, p_atlas boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.week_activity (workspace_id, day, people, atlas)
  values (p_ws, p_day, case when p_atlas then 0 else 1 end, case when p_atlas then 1 else 0 end)
  on conflict (workspace_id, day) do update
    set people = public.week_activity.people + excluded.people,
        atlas  = public.week_activity.atlas + excluded.atlas
$$;

drop function if exists public.reset_ticket_number();
create or replace function public.reset_ticket_number(p_ws text) returns void
language sql security definer set search_path = public as $$
  update public.workspaces set ticket_seq = 149 where id = p_ws and demo
$$;

drop function if exists public.claim_agent_run(text, integer, integer);
create or replace function public.claim_agent_run(p_ws text, p_id text, p_stale_seconds integer, p_max_attempts integer)
returns setof public.agent_runs
language sql
set search_path = ''
as $$
  update public.agent_runs
     set status = 'running', started_at = now(), attempts = attempts + 1
   where workspace_id = p_ws
     and id = p_id
     and attempts < p_max_attempts
     and (status = 'queued' or (status = 'running' and started_at < now() - make_interval(secs => p_stale_seconds)))
  returning *;
$$;

-- ---------------------------------------------------------------- access

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels enable row level security;
alter table public.invites enable row level security;
revoke all on public.profiles, public.workspaces, public.workspace_members, public.channels, public.invites from anon, authenticated;

revoke all on function public.next_ticket_id(text), public.bump_week(text, integer, boolean), public.reset_ticket_number(text),
  public.claim_agent_run(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.next_ticket_id(text), public.bump_week(text, integer, boolean), public.reset_ticket_number(text),
  public.claim_agent_run(text, text, integer, integer) to service_role;
