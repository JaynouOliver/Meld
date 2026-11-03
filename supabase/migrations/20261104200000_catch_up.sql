-- "What did I miss?": when each person last looked at each chat, and cached summaries
-- of stretches of conversation (so a catch-up doesn't re-summarize the same messages).
create table if not exists public.read_markers (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  user_id      text not null,
  chat_id      text not null,
  last_read_at timestamptz not null,
  primary key (workspace_id, user_id, chat_id)
);

create table if not exists public.summaries (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  key          text not null,             -- chat + first and last message id summarized
  chat_id      text not null,
  text         text not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, key)
);

-- "Messages since" for catch-ups.
create index if not exists messages_ws_created on public.messages (workspace_id, created_at);

alter table public.read_markers enable row level security;
alter table public.summaries enable row level security;
revoke all on public.read_markers, public.summaries from anon, authenticated;
