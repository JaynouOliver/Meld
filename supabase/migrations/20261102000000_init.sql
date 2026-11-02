-- Meld schema v1.
-- Access model: Row Level Security is on for every table with NO policies, so the
-- public (anon/publishable) key can't read or write anything. Only the server, using
-- the service-role key, touches data. Browsers get "something changed" pings over
-- Realtime broadcast and refetch through the app's API, which enforces roles.

create table if not exists public.tickets (
  id          text primary key,                 -- NW-121
  team        text not null check (team in ('design', 'payments', 'platform')),
  title       text not null default '',
  description text not null default '',
  status      text not null check (status in ('To do', 'In progress', 'In review', 'Done', 'Backburner')),
  priority    text not null check (priority in ('Low', 'Medium', 'High')),
  assignee    text not null,
  reporter    text not null,
  links       jsonb not null default '[]',
  images      jsonb not null default '[]',
  watch       jsonb,                             -- {chat, thread}: where Atlas posts updates
  activity    jsonb not null default '[]',
  updated     text not null default 'Today',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Messages and replies in one table. thread_id = the top-level message a reply belongs
-- to; parent_id = the reply it answers (null for direct replies to the thread root).
create table if not exists public.messages (
  seq        bigserial unique,                   -- stable ordering
  id         text primary key,
  chat_id    text not null,
  thread_id  text references public.messages (id) on delete cascade,
  parent_id  text references public.messages (id) on delete cascade,
  who        text not null,
  text       text not null,
  ticket_id  text,                               -- ticket card attached to the message
  time_label text not null,                      -- display time (ISO for new messages)
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_seq on public.messages (chat_id, seq);
create index if not exists messages_thread on public.messages (thread_id);
-- Full-text search over chat history (Atlas's search_messages; Meta has no embeddings API).
create index if not exists messages_fts on public.messages using gin (to_tsvector('english', text));

-- Append-only event log: every message and ticket change. The memory pipeline
-- (summaries, facts, digests) will read from here.
create table if not exists public.events (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  kind       text not null,                      -- message.posted, ticket.created, ticket.updated, ticket.deleted
  actor      text not null,                      -- person id, or 'atlas'
  chat_id    text,
  ticket_id  text,
  payload    jsonb not null default '{}'
);
create index if not exists events_at on public.events (at);

-- "Ticket changes this week" chart: people vs Atlas per weekday (0 = Monday).
create table if not exists public.week_activity (
  day    smallint primary key check (day between 0 and 6),
  people integer not null default 0,
  atlas  integer not null default 0
);

create sequence if not exists public.ticket_number start 150;

create or replace function public.next_ticket_id() returns text
language sql security definer set search_path = public as $$
  select 'NW-' || nextval('public.ticket_number')::text
$$;

create or replace function public.bump_week(p_day integer, p_atlas boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.week_activity (day, people, atlas)
  values (p_day, case when p_atlas then 0 else 1 end, case when p_atlas then 1 else 0 end)
  on conflict (day) do update
    set people = public.week_activity.people + excluded.people,
        atlas  = public.week_activity.atlas + excluded.atlas
$$;

alter table public.tickets enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.week_activity enable row level security;

revoke all on public.tickets, public.messages, public.events, public.week_activity from anon, authenticated;
revoke all on function public.next_ticket_id(), public.bump_week(integer, boolean) from public, anon, authenticated;
grant execute on function public.next_ticket_id(), public.bump_week(integer, boolean) to service_role;
grant usage, select on sequence public.ticket_number to service_role;

-- Demo reset: restart ticket numbering (used by the "reset workspace" action).
create or replace function public.reset_ticket_number() returns void
language sql security definer set search_path = public as $$
  select setval('public.ticket_number', 150, false)
$$;
revoke all on function public.reset_ticket_number() from public, anon, authenticated;
grant execute on function public.reset_ticket_number() to service_role;
