-- One row per CFBD sync, for the admin page ("last synced", quota left) and debugging.
create table public.sync_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('teams', 'games', 'rosters', 'lines')),
  season_year int not null,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cfbd_calls int not null default 0,
  cfbd_calls_remaining int,        -- from CFBD's x-calllimit-remaining header
  summary jsonb,                   -- row counts, skipped items
  error text
);
create index sync_runs_recent_idx on public.sync_runs (kind, started_at desc);

alter table public.sync_runs enable row level security;
grant select, insert, update, delete on public.sync_runs to service_role;
grant usage, select on all sequences in schema public to service_role;
