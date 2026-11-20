-- End of season: the league's last week, and Championship week's "anyone playing" rule.

-- The league's last week (2026: 14, the FBS conference championships). Weeks after it (Army–Navy,
-- bowls) aren't part of the game.
alter table public.league_seasons
  add column last_week smallint not null default 14 check (last_week between 1 and 20);

-- A pick in a Championship week doesn't use up its player, and a player used earlier in the season
-- can be picked again that week. `reusable` mirrors the week's rule (set by the triggers below), and
-- the one-use index ignores reusable picks.
alter table public.picks add column reusable boolean not null default false;

drop index public.picks_one_use_per_player;
create unique index picks_one_use_per_player on public.picks (entry_id, player_id) where status <> 'dnp' and not reusable;

create function public.picks_set_reusable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reusable := exists (
    select 1
    from public.entries e
    join public.league_weeks lw on lw.league_id = e.league_id and lw.season_id = e.season_id and lw.week = new.week
    where e.id = new.entry_id and lw.rule = 'championship'
  );
  return new;
end;
$$;

create trigger picks_set_reusable
  before insert or update of entry_id, week on public.picks
  for each row execute function public.picks_set_reusable();

-- Changing a week's rule re-marks that week's picks. Turning Championship week off fails if someone
-- already re-picked a used player that week (the one-use index), which is the right outcome.
create function public.league_weeks_sync_reusable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.picks p
  set reusable = (new.rule = 'championship')
  from public.entries e
  where p.entry_id = e.id
    and e.league_id = new.league_id
    and e.season_id = new.season_id
    and p.week = new.week
    and p.reusable is distinct from (new.rule = 'championship');
  return null;
end;
$$;

create trigger league_weeks_sync_reusable
  after insert or update of rule on public.league_weeks
  for each row execute function public.league_weeks_sync_reusable();

-- 2026: week 14 is Championship week.
insert into public.league_weeks (league_id, season_id, week, rule)
select l.id, s.id, 14, 'championship'
from public.leagues l, public.seasons s
where l.slug = 'main' and s.year = 2026
on conflict (league_id, season_id, week) do update set rule = excluded.rule;
