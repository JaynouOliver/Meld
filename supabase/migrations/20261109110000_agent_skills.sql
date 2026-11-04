-- Agent skills: persistent agent memory. Additive: new tables only.

-- Facts people ask an agent to keep ("Maya is out on Fridays"). agent_id is the agent's
-- id, or 'team' for facts every agent reads. The newest go into the agent's prompt.
create table if not exists public.agent_memories (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  agent_id     text not null,
  text         text not null check (char_length(text) between 1 and 500),
  created_by   text not null,
  created_at   timestamptz not null default now()
);
create index if not exists agent_memories_ws on public.agent_memories (workspace_id, created_at desc);

alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from anon, authenticated;
