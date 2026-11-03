-- Atlas actions: changes held for confirmation (deletes, bulk edits) or applied
-- with an undo window. The chat shows a card for each, linked from the message.
create table if not exists public.agent_actions (
  id          text primary key,
  chat_id     text not null,
  message_id  text,
  status      text not null check (status in ('pending', 'applied', 'canceled', 'undone')),
  ops         jsonb not null,              -- [{type: create|update|delete, before?, after?, changes?}]
  summary     jsonb not null default '[]', -- one line per change, as shown on the card
  destructive boolean not null default false,
  undo_until  timestamptz,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists agent_actions_chat on public.agent_actions (chat_id);

alter table public.messages add column if not exists action_id text;

-- Same access model as the other tables: server (service role) only.
alter table public.agent_actions enable row level security;
revoke all on public.agent_actions from anon, authenticated;
