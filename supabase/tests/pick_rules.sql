-- Database-level pick rules: lock at kickoff, single use, DNP release, consistency checks.
-- Runs inside a transaction that is rolled back, so it is safe against the hosted project:
--   supabase db query --remote -f supabase/tests/pick_rules.sql
-- Every row in the output should have passed = true.

begin;

create temp table results (test text, passed boolean, detail text);

-- Runs a statement that must fail, recording whether it failed the expected way.
-- `expected` is matched against the SQLSTATE or the start of the error message.
create function pg_temp.expect_fail(test text, stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into results values (test, false, 'statement succeeded but should have failed');
exception when others then
  insert into results values (test, sqlstate = expected or sqlerrm like expected || '%', sqlstate || ' ' || sqlerrm);
end;
$$;

create function pg_temp.expect_ok(test text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into results values (test, true, null);
exception when others then
  insert into results values (test, false, sqlstate || ' ' || sqlerrm);
end;
$$;

do $$
declare
  season bigint := (select id from public.seasons where year = 2026);
  entry bigint := (select e.id from public.entries e where e.season_id = (select id from public.seasons where year = 2026) limit 1);
  team_a bigint; team_b bigint;
  g_future bigint; g_future2 bigint; g_past bigint;
  qb bigint; rb bigint; wr bigint;
  locked_pick bigint;
begin
  insert into public.teams (cfbd_id, school) values (-900001, 'Test A') returning id into team_a;
  insert into public.teams (cfbd_id, school) values (-900002, 'Test B') returning id into team_b;

  insert into public.games (cfbd_id, season_id, week, home_team_id, away_team_id, kickoff_at)
    values (-1, season, 50, team_a, team_b, now() + interval '1 day') returning id into g_future;
  insert into public.games (cfbd_id, season_id, week, home_team_id, away_team_id, kickoff_at)
    values (-2, season, 52, team_a, team_b, now() + interval '8 days') returning id into g_future2;
  insert into public.games (cfbd_id, season_id, week, home_team_id, away_team_id, kickoff_at)
    values (-3, season, 51, team_a, team_b, now() - interval '1 hour') returning id into g_past;

  insert into public.players (name) values ('Test QB') returning id into qb;
  insert into public.players (name) values ('Test RB') returning id into rb;
  insert into public.players (name) values ('Test WR') returning id into wr;
  insert into public.player_seasons (player_id, season_id, team_id, position) values
    (qb, season, team_a, 'QB'), (rb, season, team_a, 'RB'), (wr, season, team_a, 'WR');

  perform pg_temp.expect_ok('pick before kickoff is allowed', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 50, ''QB'', %s, %s, %s)',
    entry, qb, g_future, team_a));

  perform pg_temp.expect_fail('same player cannot be used twice', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 52, ''QB'', %s, %s, %s)',
    entry, qb, g_future2, team_a), '23505');

  perform pg_temp.expect_ok('marking a pick DNP is allowed', format(
    'update public.picks set status = ''dnp'' where entry_id = %s and week = 50 and slot = ''QB''', entry));

  perform pg_temp.expect_ok('DNP player can be used again', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 52, ''QB'', %s, %s, %s)',
    entry, qb, g_future2, team_a));

  perform pg_temp.expect_fail('pick after kickoff is rejected', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 51, ''RB'', %s, %s, %s)',
    entry, rb, g_past, team_a), 'pick_locked');

  -- A pick made before kickoff (simulated with the import bypass) on a game that has now started.
  perform set_config('pickem.bypass_lock', 'on', true);
  insert into public.picks (entry_id, week, slot, player_id, game_id, team_id)
    values (entry, 51, 'RB', rb, g_past, team_a) returning id into locked_pick;
  perform set_config('pickem.bypass_lock', 'off', true);

  perform pg_temp.expect_ok('scoring a locked pick is allowed', format(
    'update public.picks set status = ''final'', points = 12 where id = %s', locked_pick));

  perform pg_temp.expect_fail('changing the player on a locked pick is rejected', format(
    'update public.picks set player_id = %s where id = %s', wr, locked_pick), 'pick_locked');

  perform pg_temp.expect_fail('deleting a locked pick is rejected', format(
    'delete from public.picks where id = %s', locked_pick), 'pick_locked');

  perform pg_temp.expect_fail('pick week must match the game week', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 50, ''WRTE'', %s, %s, %s)',
    entry, wr, g_future2, team_a), 'pick_invalid');

  perform pg_temp.expect_fail('player must be on the picked team', format(
    'insert into public.picks (entry_id, week, slot, player_id, game_id, team_id) values (%s, 50, ''WRTE'', %s, %s, %s)',
    entry, wr, g_future, team_b), 'pick_invalid');

  insert into results values (
    'TBD kickoff locks at noon Eastern',
    public.game_lock_at('2026-11-28 05:00:00+00', true) = '2026-11-28 17:00:00+00',
    public.game_lock_at('2026-11-28 05:00:00+00', true)::text);
end;
$$;

select test, passed, detail from results;

rollback;
