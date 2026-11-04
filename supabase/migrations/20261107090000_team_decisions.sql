-- Decision memory: decisions the listener agent spotted in conversation (or that were
-- answered on a mission), with the why, the rejected options and who decided.
create table if not exists public.team_decisions (
  id              text primary key,
  workspace_id    text not null references public.workspaces (id) on delete cascade,
  topic           text not null,
  statement       text not null,
  rationale       text not null default '',
  rejected        jsonb not null default '[]',
  deciders        jsonb not null default '[]',
  chat_id         text not null,
  thread_id       text,
  message_id      text not null,
  status          text not null default 'active' check (status in ('active', 'reopened', 'superseded')),
  superseded_by   text,
  flags           integer not null default 0,
  last_flagged_at timestamptz,
  source          text not null default 'chat' check (source in ('chat', 'mission')),
  created_at      timestamptz not null default now()
);
create index if not exists team_decisions_ws on public.team_decisions (workspace_id, created_at desc);

alter table public.team_decisions enable row level security;
revoke all on public.team_decisions from anon, authenticated;
