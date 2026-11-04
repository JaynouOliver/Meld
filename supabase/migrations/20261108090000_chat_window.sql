-- A chat's latest conversations in one round trip: the newest p_limit top-level
-- messages, all their replies, and the agent actions they carry, as one JSON value
-- (so the API's 1,000-row cap never truncates a busy thread).
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
        'ticket_id', ticket_id, 'time_label', time_label, 'action_id', action_id, 'reactions', reactions, 'seq', seq
      ) order by seq) from win), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(a)) from agent_actions a
      where a.workspace_id = p_ws and a.id in (select action_id from win where action_id is not null)), '[]'::jsonb)
  );
$$;

revoke execute on function public.chat_window(text, text, int) from public, anon, authenticated;

-- The two lookups chat_window makes: a chat's newest top-level messages, and a
-- thread's replies in order.
create index if not exists messages_ws_chat_roots on public.messages (workspace_id, chat_id, seq desc) where thread_id is null;
create index if not exists messages_ws_thread_seq on public.messages (workspace_id, thread_id, seq) where thread_id is not null;
