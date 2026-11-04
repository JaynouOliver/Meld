-- Workflow automation: auto-triage of new tickets and agent playbooks. Additive: new tables only.

-- One triage per ticket (the primary key is the claim, so it never runs twice).
create table if not exists public.ticket_triages (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  ticket_id    text not null,
  agent_id     text not null,
  action_id    text,
  status       text not null check (status in ('running', 'applied', 'skipped', 'undone', 'failed')),
  summary      text not null default '',
  reason       text not null default '',
  by_user      text not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, ticket_id)
);

-- A trigger plus ordered steps (agent + instruction), as jsonb.
create table if not exists public.playbooks (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  trigger      jsonb not null,
  steps        jsonb not null,
  enabled      boolean not null default true,
  chat_id      text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists playbooks_ws on public.playbooks (workspace_id, created_at);

-- One row per playbook firing. The id is derived from the triggering event, so the same
-- event can't start a playbook twice; step advances are conditional updates on (status, step).
create table if not exists public.playbook_runs (
  id            text primary key,
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  playbook_id   text not null,
  playbook_name text not null,
  ticket_id     text not null,
  chat_id       text not null,
  thread_id     text,
  step          integer not null default 0,
  total         integer not null,
  status        text not null check (status in ('running', 'done', 'failed')),
  error         text,
  run_ids       jsonb not null default '[]'::jsonb,
  requester     text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists playbook_runs_ws_pb on public.playbook_runs (workspace_id, playbook_id, created_at desc);
create index if not exists playbook_runs_ws_ticket on public.playbook_runs (workspace_id, ticket_id, created_at desc);

alter table public.ticket_triages enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_runs enable row level security;
revoke all on public.ticket_triages from anon, authenticated;
revoke all on public.playbooks from anon, authenticated;
revoke all on public.playbook_runs from anon, authenticated;
