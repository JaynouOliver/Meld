-- Slack-style message depth: edit, delete (a tombstone keeps a thread whose root was
-- deleted) and pins. Additive: new nullable columns, and chat_window returns them.
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists pinned_at  timestamptz;
alter table public.messages add column if not exists pinned_by  text;

-- A chat's pinned messages, newest pin first (the header's "Pinned" list).
create index if not exists messages_ws_chat_pinned on public.messages (workspace_id, chat_id, pinned_at desc) where pinned_at is not null;

-- Same as 20261108090000_chat_window.sql, plus the four columns above.
create or replace function public.chat_window(p_ws text, p_chat text, p_limit int default 300)
returns jsonb
language sql
stable
set search_path = public
as $$
  with roots as (
    select * from messages
    where workspace_id = p_ws and chat_id = p_chat and thread_id is null
    order by seq desc
    limit p_limit
  ), win as (
    select * from roots
    union all
    select m.* from messages m join roots r on m.thread_id = r.id
    where m.workspace_id = p_ws
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'chat_id', chat_id, 'thread_id', thread_id, 'parent_id', parent_id, 'who', who, 'text', text,
        'ticket_id', ticket_id, 'time_label', time_label, 'action_id', action_id, 'reactions', reactions, 'seq', seq,
        'edited_at', edited_at, 'deleted_at', deleted_at, 'pinned_at', pinned_at, 'pinned_by', pinned_by
      ) order by seq) from win), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(a)) from agent_actions a
      where a.workspace_id = p_ws and a.id in (select action_id from win where action_id is not null)), '[]'::jsonb)
  );
$$;

revoke execute on function public.chat_window(text, text, int) from public, anon, authenticated;
