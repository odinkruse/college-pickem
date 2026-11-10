-- Starting data: seasons, the owner's profile, and the league.
-- Idempotent: safe to run more than once. Teams, games and players come from CFBD sync, not here.

insert into public.seasons (year) values (2026), (2027)
on conflict (year) do nothing;

-- Fixed id so this file can refer to it and re-runs don't create duplicates.
insert into public.profiles (id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Odin')
on conflict (id) do nothing;

insert into public.leagues (slug, name)
values ('main', 'College Pick''em')
on conflict (slug) do nothing;

insert into public.league_members (league_id, profile_id, role)
select l.id, '00000000-0000-4000-8000-000000000001', 'owner'
from public.leagues l where l.slug = 'main'
on conflict do nothing;

insert into public.entries (league_id, season_id, profile_id)
select l.id, s.id, '00000000-0000-4000-8000-000000000001'
from public.leagues l, public.seasons s
where l.slug = 'main' and s.year in (2026, 2027)
on conflict do nothing;
