-- Phase 10: members sign in (Supabase Auth) and pick in the app; the league sheet fills the gaps.

-- League admins besides the owner (e.g. whoever runs the sheet).
alter type public.member_role add value if not exists 'admin';

-- One-time code in a member's invite link (/join/<code>); cleared when they claim their profile.
alter table public.profiles add column invite_code text unique;

-- How each pick got in. App picks are never overwritten by the sheet import; admin changes are
-- deliberate corrections (see pick_import_overrides).
alter table public.picks add column entered_via text not null default 'app'
  check (entered_via in ('app', 'sheet', 'admin'));
update public.picks set entered_via = 'sheet';
update public.picks p set entered_via = 'admin'
from public.pick_import_overrides o
where o.entry_id = p.entry_id and o.week = p.week and o.slot = p.slot;

-- import_picks: p_force (admin changes) overrides app picks; otherwise an app pick is kept and
-- reported as 'kept_app'. Each row may carry entered_via (default 'sheet').
drop function public.import_picks(jsonb);
create function public.import_picks(p_picks jsonb, p_force boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
  results jsonb := '[]'::jsonb;
  existing public.picks%rowtype;
  via text;
begin
  perform set_config('pickem.bypass_lock', 'on', true);
  for r in select * from jsonb_array_elements(p_picks) loop
    via := coalesce(r->>'entered_via', 'sheet');
    begin
      select * into existing from public.picks
      where entry_id = (r->>'entry_id')::bigint and week = (r->>'week')::smallint and slot = (r->>'slot')::public.pick_slot;

      if found and existing.player_id = (r->>'player_id')::bigint and existing.game_id = (r->>'game_id')::bigint
         and existing.team_id = (r->>'team_id')::bigint then
        if p_force and existing.entered_via <> via then
          update public.picks set entered_via = via where id = existing.id;
        end if;
        results := results || jsonb_build_object('key', r->'key', 'result', 'unchanged');
      elsif found and existing.entered_via = 'app' and not p_force then
        results := results || jsonb_build_object('key', r->'key', 'result', 'kept_app');
      elsif found then
        update public.picks
        set player_id = (r->>'player_id')::bigint, game_id = (r->>'game_id')::bigint, team_id = (r->>'team_id')::bigint,
            status = 'pending', points = null, review_reason = null, spread_at_pick = (r->>'spread_at_pick')::numeric,
            entered_via = via
        where id = existing.id;
        results := results || jsonb_build_object('key', r->'key', 'result', 'updated');
      else
        insert into public.picks (entry_id, week, slot, player_id, game_id, team_id, spread_at_pick, entered_via)
        values ((r->>'entry_id')::bigint, (r->>'week')::smallint, (r->>'slot')::public.pick_slot, (r->>'player_id')::bigint,
                (r->>'game_id')::bigint, (r->>'team_id')::bigint, (r->>'spread_at_pick')::numeric, via);
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

revoke execute on function public.import_picks(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_picks(jsonb, boolean) to service_role;
