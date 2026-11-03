-- Ticket dependencies: ids of tickets that must be done before this one can move.
alter table public.tickets add column if not exists blocked_by jsonb not null default '[]';
