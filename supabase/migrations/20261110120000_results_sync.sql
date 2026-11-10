-- Weekly results sync (games + box scores for one week, then scoring).
alter table public.sync_runs drop constraint sync_runs_kind_check;
alter table public.sync_runs
  add constraint sync_runs_kind_check check (kind in ('teams', 'games', 'rosters', 'lines', 'results'));
alter table public.sync_runs add column week smallint;
