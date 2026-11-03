-- Missions (docs/agent-platform.md): a goal with a deadline that agents plan into tickets,
-- drive with check-ins, and escalate decisions on.
create table if not exists public.missions (
  id              text primary key,
  workspace_id    text not null references public.workspaces (id) on delete cascade,
  title           text not null,
  goal            text not null,
  chat_id         text not null,             -- channel it was launched from
  thread_id       text,                      -- the mission's thread there
  status          text not null default 'draft' check (status in ('planning', 'draft', 'active', 'at_risk', 'done', 'canceled')),
  deadline        date,
  plan            jsonb not null default '{}', -- planner output (tasks, decisions, risks)
  summary         text not null default '',
  health          text not null default '',  -- latest check-in verdict, one line
  created_by      text,
  created_at      timestamptz not null default now(),
  launched_at     timestamptz,
  last_checkin_at timestamptz
);
create index if not exists missions_ws on public.missions (workspace_id, created_at);

create table if not exists public.mission_decisions (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  mission_id   text not null references public.missions (id) on delete cascade,
  question     text not null,
  options      jsonb not null default '[]',
  context      text not null default '',
  status       text not null default 'open' check (status in ('open', 'answered')),
  answer       text,
  answered_by  text,
  answered_at  timestamptz,
  actions      jsonb not null default '{}',  -- option -> what Atlas does when it's chosen
  created_at   timestamptz not null default now()
);
create index if not exists mission_decisions_ws on public.mission_decisions (workspace_id, status);

create table if not exists public.mission_events (
  id           bigserial primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  mission_id   text not null references public.missions (id) on delete cascade,
  kind         text not null,                -- planned | launched | checkin | nudge | decision | replanned | done
  actor        text,
  text         text not null,
  at           timestamptz not null default now()
);
create index if not exists mission_events_mission on public.mission_events (mission_id, at);

-- Tickets belong to a mission and can have a due date.
alter table public.tickets add column if not exists mission_id text;
alter table public.tickets add column if not exists due date;

alter table public.missions enable row level security;
alter table public.mission_decisions enable row level security;
alter table public.mission_events enable row level security;
revoke all on public.missions, public.mission_decisions, public.mission_events from anon, authenticated;
