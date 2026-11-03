-- Atlas runs as queued jobs (docs/architecture.md §4). Posting an @Atlas message
-- enqueues a run; a worker claims it, runs the agent and records the outcome.
create table if not exists public.agent_runs (
  id                 text primary key,
  trigger_message_id text not null unique,   -- one run per message: retried requests don't double-run
  chat_id            text not null,
  thread_id          text,
  role               text not null,
  text               text not null,
  status             text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts           integer not null default 0,
  error              text,
  result             jsonb,                  -- {touchedChats, openTicket, deleted}
  trace              jsonb,                  -- model, tool calls, tokens, timing
  created_at         timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz
);
create index if not exists agent_runs_active on public.agent_runs (created_at) where status in ('queued', 'running');
create index if not exists agent_runs_finished on public.agent_runs (finished_at);

-- Claim a run atomically: queued, or "running" for longer than p_stale_seconds (its
-- worker died), and under the attempt limit. Returns the claimed row, or nothing.
create or replace function public.claim_agent_run(p_id text, p_stale_seconds integer, p_max_attempts integer)
returns setof public.agent_runs
language sql
set search_path = ''
as $$
  update public.agent_runs
     set status = 'running', started_at = now(), attempts = attempts + 1
   where id = p_id
     and attempts < p_max_attempts
     and (status = 'queued' or (status = 'running' and started_at < now() - make_interval(secs => p_stale_seconds)))
  returning *;
$$;

-- Same access model as the other tables: server (service role) only.
alter table public.agent_runs enable row level security;
revoke all on public.agent_runs from anon, authenticated;
revoke all on function public.claim_agent_run(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_agent_run(text, integer, integer) to service_role;
