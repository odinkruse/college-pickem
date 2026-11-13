-- Phase 8: importing the league's picks from its Google Sheet.

-- The sheet changes every season ("CFB Fantasy 2026 Rosters"), so it hangs off league × season.
create table public.league_seasons (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season_id bigint not null references public.seasons (id) on delete cascade,
  pick_sheet_id text,                      -- Google Sheets id; the sheet must be shared "anyone with the link"
  primary key (league_id, season_id)
);
alter table public.league_seasons enable row level security;
grant select, insert, update, delete on public.league_seasons to service_role;

-- Which sheet tab holds a member's picks (the tab name is also their display name on import).
alter table public.league_members add column sheet_tab text;
create unique index league_members_sheet_tab on public.league_members (league_id, sheet_tab) where sheet_tab is not null;

insert into public.league_seasons (league_id, season_id, pick_sheet_id)
select l.id, s.id, '1DTS03unWzJ_KZoNfnPvrrfJpZ6HCrFgaKqnB69Wz0uU'
from public.leagues l, public.seasons s
where l.slug = 'main' and s.year = 2026
on conflict do nothing;

update public.league_members m set sheet_tab = 'Odin'
from public.leagues l
where m.league_id = l.id and l.slug = 'main' and m.profile_id = '00000000-0000-4000-8000-000000000001';

-- Writes imported picks with the kickoff lock bypassed (they are after the fact by nature). Each row
-- is handled on its own, so one bad row (e.g. a player used twice) is reported without blocking the rest.
-- p_picks: [{key, entry_id, week, slot, player_id, game_id, team_id, spread_at_pick}]
-- Returns [{key, result: inserted|updated|unchanged|error, message?}]
create function public.import_picks(p_picks jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
  results jsonb := '[]'::jsonb;
  existing public.picks%rowtype;
begin
  perform set_config('pickem.bypass_lock', 'on', true);
  for r in select * from jsonb_array_elements(p_picks) loop
    begin
      select * into existing from public.picks
      where entry_id = (r->>'entry_id')::bigint and week = (r->>'week')::smallint and slot = (r->>'slot')::public.pick_slot;

      if found and existing.player_id = (r->>'player_id')::bigint and existing.game_id = (r->>'game_id')::bigint
         and existing.team_id = (r->>'team_id')::bigint then
        results := results || jsonb_build_object('key', r->'key', 'result', 'unchanged');
      elsif found then
        update public.picks
        set player_id = (r->>'player_id')::bigint, game_id = (r->>'game_id')::bigint, team_id = (r->>'team_id')::bigint,
            status = 'pending', points = null, review_reason = null, spread_at_pick = (r->>'spread_at_pick')::numeric
        where id = existing.id;
        results := results || jsonb_build_object('key', r->'key', 'result', 'updated');
      else
        insert into public.picks (entry_id, week, slot, player_id, game_id, team_id, spread_at_pick)
        values ((r->>'entry_id')::bigint, (r->>'week')::smallint, (r->>'slot')::public.pick_slot, (r->>'player_id')::bigint,
                (r->>'game_id')::bigint, (r->>'team_id')::bigint, (r->>'spread_at_pick')::numeric);
        results := results || jsonb_build_object('key', r->'key', 'result', 'inserted');
      end if;
    exception when others then
      results := results || jsonb_build_object(
        'key', r->'key', 'result', 'error',
        'message', case when sqlstate = '23505' then 'player already used by this entry in another week' else sqlerrm end);
    end;
  end loop;
  perform set_config('pickem.bypass_lock', 'off', true);
  return results;
end;
$$;

revoke execute on function public.import_picks(jsonb) from public, anon, authenticated;
grant execute on function public.import_picks(jsonb) to service_role;
