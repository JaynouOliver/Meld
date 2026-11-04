-- Agent gaps: playbooks triggered by a keyword in a channel message. Additive: nullable columns only.
-- A keyword run has no ticket (ticket_id is ''); it works in the message's thread and
-- remembers the message that started it, for the Playbooks page.
alter table public.playbook_runs add column if not exists message_id text;
alter table public.playbook_runs add column if not exists message_text text;
alter table public.playbook_runs add column if not exists message_author text;

-- One run per message and playbook is already guaranteed by the run id (derived from both).
create index if not exists playbook_runs_ws_message on public.playbook_runs (workspace_id, message_id) where message_id is not null;
