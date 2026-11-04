-- Jira-style depth on tickets: labels, story points, a checklist and comments.
-- Additive only; existing rows get empty defaults.
alter table public.tickets add column if not exists labels jsonb not null default '[]';
alter table public.tickets add column if not exists estimate numeric;
alter table public.tickets add column if not exists checklist jsonb not null default '[]';
alter table public.tickets add column if not exists comments jsonb not null default '[]';
