-- New seasons: the site's current season is the latest one an admin has started (not the calendar),
-- so a finished season stays up until the next one is set up on /admin/season.

alter table public.league_seasons add column started_at timestamptz;
update public.league_seasons set started_at = now() where started_at is null;

-- Contact details kept on file for each member (the sign-in email lives in auth.users).
alter table public.profiles
  add column contact_email text,
  add column phone text;

-- Starts a season in one transaction: the season row (scoring rules carried over from the last
-- started season), the league's settings and special weeks for it, returning members' entries (with
-- their edited names and contact details), and new members (profile, membership, entry, invite code).
--
-- p: {
--   year, pick_sheet_id, scoring_sheet_id, last_week,
--   weeks: [{ week, rule }],
--   members: [{ profile_id, display_name, contact_email, phone, returning }],
--   new_members: [{ display_name, contact_email, phone }]
-- }
create function public.start_season(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_year int := (p ->> 'year')::int;
  v_league bigint;
  v_season bigint;
  v_rules jsonb;
  v_profile uuid;
  v_entries int := 0;
  v_new jsonb := '[]'::jsonb;
  m jsonb;
begin
  select id into v_league from public.leagues where slug = 'main';
  if v_league is null then
    raise exception 'start_season: no league' using hint = 'start_season';
  end if;

  if exists (
    select 1 from public.league_seasons ls join public.seasons s on s.id = ls.season_id
    where ls.league_id = v_league and s.year = v_year and ls.started_at is not null
  ) then
    raise exception 'start_season: % has already been started', v_year using hint = 'start_season';
  end if;

  select s.scoring_rules into v_rules
  from public.league_seasons ls join public.seasons s on s.id = ls.season_id
  where ls.league_id = v_league and ls.started_at is not null
  order by s.year desc
  limit 1;

  -- A CFBD sync may already have created the season row; keep it and carry the rules over.
  insert into public.seasons (year) values (v_year)
  on conflict (year) do update set year = excluded.year
  returning id into v_season;
  if v_rules is not null then
    update public.seasons set scoring_rules = v_rules where id = v_season;
  end if;

  insert into public.league_seasons (league_id, season_id, pick_sheet_id, scoring_sheet_id, last_week, started_at)
  values (
    v_league, v_season,
    nullif(p ->> 'pick_sheet_id', ''), nullif(p ->> 'scoring_sheet_id', ''),
    coalesce((p ->> 'last_week')::smallint, 14), now()
  )
  on conflict (league_id, season_id) do update
  set pick_sheet_id = excluded.pick_sheet_id,
      scoring_sheet_id = excluded.scoring_sheet_id,
      last_week = excluded.last_week,
      started_at = excluded.started_at;

  delete from public.league_weeks where league_id = v_league and season_id = v_season;
  insert into public.league_weeks (league_id, season_id, week, rule)
  select v_league, v_season, (w ->> 'week')::smallint, (w ->> 'rule')::public.week_rule
  from jsonb_array_elements(coalesce(p -> 'weeks', '[]'::jsonb)) w;

  for m in select * from jsonb_array_elements(coalesce(p -> 'members', '[]'::jsonb)) loop
    update public.profiles
    set display_name = m ->> 'display_name',
        contact_email = nullif(m ->> 'contact_email', ''),
        phone = nullif(m ->> 'phone', '')
    where id = (m ->> 'profile_id')::uuid;
    if (m ->> 'returning')::boolean then
      insert into public.entries (league_id, season_id, profile_id)
      values (v_league, v_season, (m ->> 'profile_id')::uuid)
      on conflict do nothing;
      v_entries := v_entries + 1;
    end if;
  end loop;

  for m in select * from jsonb_array_elements(coalesce(p -> 'new_members', '[]'::jsonb)) loop
    insert into public.profiles (display_name, contact_email, phone, invite_code)
    values (
      m ->> 'display_name', nullif(m ->> 'contact_email', ''), nullif(m ->> 'phone', ''),
      rtrim(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'), '=')
    )
    returning id into v_profile;
    -- The sheet tab defaults to the name, so an import matches a tab of that name to this member.
    insert into public.league_members (league_id, profile_id, role, sheet_tab)
    values (v_league, v_profile, 'member', m ->> 'display_name');
    insert into public.entries (league_id, season_id, profile_id) values (v_league, v_season, v_profile);
    v_entries := v_entries + 1;
    v_new := v_new || jsonb_build_object('id', v_profile, 'name', m ->> 'display_name');
  end loop;

  return jsonb_build_object('season_id', v_season, 'entries', v_entries, 'new_members', v_new);
end;
$$;

revoke all on function public.start_season(jsonb) from public, anon, authenticated;
grant execute on function public.start_season(jsonb) to service_role;
