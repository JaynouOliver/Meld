-- Jump to old messages: the conversations around one message, for chats longer than the
-- 100-conversation window. Additive: a new function; chat_window is unchanged.
--
-- Centers on the message's thread root (a reply jumps to its conversation), takes up to
-- p_before older and p_after newer top-level messages, plus every reply of those. Returns
-- the same JSON shape as chat_window, so the store parses both the same way.
-- "Load older" is the same call with p_after = 0 on the oldest loaded message, and
-- "Load newer" is p_before = 0 on the newest one before a gap.
create or replace function public.chat_window_around(p_ws text, p_chat text, p_id text, p_before int default 30, p_after int default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target as (
    select coalesce(m.thread_id, m.id) as root_id from messages m
    where m.workspace_id = p_ws and m.chat_id = p_chat and m.id = p_id
  ), anchor as (
    select r.seq from messages r
    where r.workspace_id = p_ws and r.chat_id = p_chat and r.id = (select root_id from target)
  ), older as (
    select * from messages
    where workspace_id = p_ws and chat_id = p_chat and thread_id is null and seq < (select seq from anchor)
    order by seq desc
    limit greatest(p_before, 0)
  ), newer as (
    -- The anchor itself plus up to p_after after it.
    select * from messages
    where workspace_id = p_ws and chat_id = p_chat and thread_id is null and seq >= (select seq from anchor)
    order by seq
    limit greatest(p_after, 0) + 1
  ), roots as (
    select * from older
    union all
    select * from newer
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

revoke execute on function public.chat_window_around(text, text, text, int, int) from public, anon, authenticated;
