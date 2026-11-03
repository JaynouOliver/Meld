-- Agents as workspace members (docs/agent-platform.md): custom and external agents,
-- which channels each agent can read and how forward it is there, agent inboxes
-- (runs per agent, with delegation depth), and emoji reactions (agents' 👀).
create table if not exists public.agents (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  handle       text not null,               -- @handle, unique per workspace
  name         text not null,
  description  text not null default '',   -- role, shown on the profile
  instructions text not null default '',   -- its system prompt additions
  tools        text[] not null default '{read}', -- read | write | delete
  kind         text not null default 'custom' check (kind in ('custom', 'external')),
  color        text,
  token_hash   text,                        -- external agents (MCP): sha-256 of the token
  created_by   text,
  created_at   timestamptz not null default now()
);
create unique index if not exists agents_handle on public.agents (workspace_id, lower(handle));
create index if not exists agents_token on public.agents (token_hash) where token_hash is not null;

-- Which agents can read a channel. Atlas is in every channel (mention-only) unless a row
-- says otherwise ('off' removes it).
create table if not exists public.channel_agents (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  chat_id      text not null,
  agent_id     text not null,
  mode         text not null check (mode in ('mention', 'lurk', 'active', 'off')),
  added_by     text,
  added_at     timestamptz not null default now(),
  primary key (workspace_id, chat_id, agent_id)
);

-- Agent inboxes: a run per agent per message; delegation depth for the loop governor.
alter table public.agent_runs add column if not exists agent_id text not null default 'atlas';
alter table public.agent_runs add column if not exists depth integer not null default 0;
alter table public.agent_runs add column if not exists parent_run_id text;
alter table public.agent_runs add column if not exists trigger text not null default 'mention';
alter table public.agent_runs drop constraint if exists agent_runs_trigger_message_id_key;
create unique index if not exists agent_runs_trigger_agent on public.agent_runs (trigger_message_id, agent_id);
create index if not exists agent_runs_ws_chat_created on public.agent_runs (workspace_id, chat_id, created_at);

-- Reactions: {"👀": ["agent or person id", ...]}.
alter table public.messages add column if not exists reactions jsonb not null default '{}';

create or replace function public.toggle_reaction(p_ws text, p_id text, p_emoji text, p_who text, p_on boolean)
returns jsonb
language sql
set search_path = ''
as $$
  update public.messages
     set reactions = case
       when p_on then jsonb_set(reactions, array[p_emoji], (coalesce(reactions -> p_emoji, '[]'::jsonb) - p_who) || to_jsonb(p_who))
       when (coalesce(reactions -> p_emoji, '[]'::jsonb) - p_who) = '[]'::jsonb then reactions - p_emoji
       else jsonb_set(reactions, array[p_emoji], (reactions -> p_emoji) - p_who)
     end
   where workspace_id = p_ws and id = p_id
  returning reactions;
$$;

alter table public.agents enable row level security;
alter table public.channel_agents enable row level security;
revoke all on public.agents, public.channel_agents from anon, authenticated;
revoke all on function public.toggle_reaction(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.toggle_reaction(text, text, text, text, boolean) to service_role;
