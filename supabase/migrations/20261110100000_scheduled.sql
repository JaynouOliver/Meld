-- Time-based agent work: reminders and the daily digest. Additive: new tables and functions only.

-- Reminders Atlas posts when due: in a person's Atlas DM or in a channel.
create table if not exists public.reminders (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  created_by        text not null,
  target_kind       text not null check (target_kind in ('person', 'channel')),
  target_id         text not null,
  text              text not null check (char_length(text) between 1 and 500),
  due_at            timestamptz not null,
  time_zone         text not null default 'UTC',
  status            text not null default 'pending' check (status in ('pending', 'sent', 'canceled', 'failed')),
  attempts          integer not null default 0,
  source_chat_id    text,
  source_thread_id  text,
  source_message_id text,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz
);
create index if not exists reminders_ws on public.reminders (workspace_id, due_at);
create index if not exists reminders_due on public.reminders (due_at) where status = 'pending';

-- Take due reminders atomically: concurrent sweeps (after(), the cron, open tabs) skip
-- rows another sweep holds, so each reminder is delivered once.
create or replace function public.claim_due_reminders(p_ws text, p_now timestamptz, p_limit integer)
returns setof public.reminders
language sql
set search_path = ''
as $$
  update public.reminders r
     set status = 'sent', sent_at = p_now, attempts = r.attempts + 1
   where r.id in (
           select id from public.reminders
            where workspace_id = p_ws and status = 'pending' and due_at <= p_now
            order by due_at
            limit p_limit
              for update skip locked
         )
     and r.status = 'pending'
  returning r.*;
$$;

-- Each channel's last daily digest (Sunny's), so it posts once per day.
create table if not exists public.channel_digests (
  workspace_id    text not null references public.workspaces (id) on delete cascade,
  chat_id         text not null,
  last_digest_at  timestamptz not null default now(),
  last_digest_day date not null,
  primary key (workspace_id, chat_id)
);

-- Claim the digest for a day: true for exactly one caller per channel per day
-- (p_force: always true, for "Post digest now", and recorded so the morning one skips).
create or replace function public.claim_channel_digest(p_ws text, p_chat text, p_day date, p_force boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  insert into public.channel_digests as d (workspace_id, chat_id, last_digest_at, last_digest_day)
  values (p_ws, p_chat, now(), p_day)
  on conflict (workspace_id, chat_id) do update
     set last_digest_at = now(), last_digest_day = greatest(d.last_digest_day, excluded.last_digest_day)
   where p_force or d.last_digest_day < excluded.last_digest_day;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Time zones people's browsers report ('*' = the workspace default), for "tomorrow at 9".
create table if not exists public.member_time_zones (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  user_id      text not null,
  time_zone    text not null check (char_length(time_zone) between 1 and 64),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Same access model as the other tables: server (service role) only.
alter table public.reminders enable row level security;
alter table public.channel_digests enable row level security;
alter table public.member_time_zones enable row level security;
revoke all on public.reminders from anon, authenticated;
revoke all on public.channel_digests from anon, authenticated;
revoke all on public.member_time_zones from anon, authenticated;
revoke all on function public.claim_due_reminders(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_channel_digest(text, text, date, boolean) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(text, timestamptz, integer) to service_role;
grant execute on function public.claim_channel_digest(text, text, date, boolean) to service_role;
