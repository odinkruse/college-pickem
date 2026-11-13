-- League sheet imports are logged in sync_runs like the CFBD syncs (summary holds the full report).
alter table public.sync_runs drop constraint sync_runs_kind_check;
alter table public.sync_runs
  add constraint sync_runs_kind_check check (kind in ('teams', 'games', 'rosters', 'lines', 'results', 'import'));
