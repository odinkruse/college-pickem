-- Admin → Weeks: change a season's special weeks and last week after it has started.

-- Saves the special weeks and last week in one transaction.
-- p: { year, last_week, weeks: [{ week, rule }] }  (weeks not listed become standard)
--
-- A week that stops being special is set to 'standard' before its row is removed, so the
-- league_weeks_sync_reusable trigger re-marks its picks; turning Championship week off fails if
-- someone re-picked an already-used player that week (picks_one_use_per_player).
create function public.set_week_settings(p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_league bigint;
  v_season bigint;
  v_last smallint := (p ->> 'last_week')::smallint;
  v_weeks jsonb := coalesce(p -> 'weeks', '[]'::jsonb);
  v_latest_pick smallint;
begin
  select ls.league_id, ls.season_id into v_league, v_season
  from public.league_seasons ls
  join public.leagues l on l.id = ls.league_id
  join public.seasons s on s.id = ls.season_id
  where l.slug = 'main' and s.year = (p ->> 'year')::int and ls.started_at is not null;
  if v_season is null then
    raise exception 'set_week_settings: % hasn''t been started', p ->> 'year' using hint = 'set_week_settings';
  end if;

  select max(pk.week) into v_latest_pick
  from public.picks pk join public.entries e on e.id = pk.entry_id
  where e.league_id = v_league and e.season_id = v_season;
  if v_latest_pick > v_last then
    raise exception 'set_week_settings: there are picks in week %, so the last week can''t be earlier', v_latest_pick
      using hint = 'set_week_settings';
  end if;

  update public.league_seasons set last_week = v_last where league_id = v_league and season_id = v_season;

  update public.league_weeks lw
  set rule = 'standard'
  where lw.league_id = v_league and lw.season_id = v_season and lw.rule <> 'standard'
    and not exists (select 1 from jsonb_array_elements(v_weeks) w where (w ->> 'week')::smallint = lw.week);
  delete from public.league_weeks
  where league_id = v_league and season_id = v_season and rule = 'standard';

  insert into public.league_weeks (league_id, season_id, week, rule)
  select v_league, v_season, (w ->> 'week')::smallint, (w ->> 'rule')::public.week_rule
  from jsonb_array_elements(v_weeks) w
  on conflict (league_id, season_id, week) do update
  set rule = excluded.rule
  where public.league_weeks.rule is distinct from excluded.rule;
end;
$$;

-- One row per regular-season week of a season, for the Admin → Weeks schedule: game dates, how many
-- games have kicked off and finished, and how many picks the league has made that week.
create function public.week_summary(p_year int)
returns table (week smallint, games int, first_kickoff timestamptz, last_kickoff timestamptz, started int, completed int, picks int)
language sql
stable
set search_path = ''
as $$
  with g as (
    select g.week, count(*)::int as games, min(g.kickoff_at) as first_kickoff, max(g.kickoff_at) as last_kickoff,
           count(*) filter (where g.kickoff_at <= now())::int as started,
           count(*) filter (where g.completed)::int as completed
    from public.games g join public.seasons s on s.id = g.season_id
    where s.year = p_year and g.season_type = 'regular'
    group by g.week
  ), pk as (
    select pk.week, count(*)::int as picks
    from public.picks pk
    join public.entries e on e.id = pk.entry_id
    join public.leagues l on l.id = e.league_id and l.slug = 'main'
    join public.seasons s on s.id = e.season_id and s.year = p_year
    group by pk.week
  )
  select g.week, g.games, g.first_kickoff, g.last_kickoff, g.started, g.completed, coalesce(pk.picks, 0)
  from g left join pk on pk.week = g.week
  order by g.week;
$$;

revoke execute on function public.set_week_settings(jsonb) from public, anon, authenticated;
revoke execute on function public.week_summary(int) from public, anon, authenticated;
grant execute on function public.set_week_settings(jsonb) to service_role;
grant execute on function public.week_summary(int) to service_role;
