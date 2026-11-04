-- Proactive Atlas: follow-ups on unanswered questions and links between conversations.
-- Additive: new tables only.

-- Direct questions the listener heard ("@Jonas can you send the keys?"). Atlas follows
-- up once in the thread if the addressee hasn't answered by due_at. The status moves
-- out of 'open' with a conditional update, so a follow-up is posted at most once.
create table if not exists public.open_questions (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  chat_id      text not null,
  thread_id    text,
  message_id   text not null,
  asker        text not null,
  addressee    text,
  summary      text not null check (char_length(summary) between 1 and 200),
  status       text not null default 'open' check (status in ('open', 'answered', 'followed_up', 'dropped')),
  asked_at     timestamptz not null default now(),
  due_at       timestamptz not null,
  follow_up_id text,
  resolved_at  timestamptz,
  resolved_by  text
);
create index if not exists open_questions_due on public.open_questions (workspace_id, status, due_at);

-- "Related: this is also being discussed in #engineering". key = '<chat>><linked root>':
-- unique, so the same pair is never linked twice.
create table if not exists public.thread_links (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  key           text not null,
  chat_id       text not null,
  message_id    text not null,
  to_chat_id    text not null,
  to_message_id text not null,
  reply_id      text not null,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, key)
);
create index if not exists thread_links_ws on public.thread_links (workspace_id, created_at desc);

alter table public.open_questions enable row level security;
alter table public.thread_links enable row level security;
revoke all on public.open_questions from anon, authenticated;
revoke all on public.thread_links from anon, authenticated;
