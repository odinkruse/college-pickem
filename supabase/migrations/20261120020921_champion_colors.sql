-- Champion's colors: each member picks a favorite team; last week's top scorer's team colors theme
-- the site for the following week.

-- School colors from CFBD's /teams ("#rrggbb"; either can be missing).
alter table public.teams
  add column color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column alt_color text check (alt_color ~ '^#[0-9a-fA-F]{6}$');

-- A member's favorite team, set by the member (/profile) or an admin (/admin/members).
alter table public.profiles
  add column favorite_team_id bigint references public.teams (id) on delete set null;

create index profiles_favorite_team_id_idx on public.profiles (favorite_team_id);
