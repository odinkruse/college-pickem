-- Core schema for College Pick'em. docs/PLAN.md describes the rules this encodes.
--
-- Three groups of tables:
--   1. Reference data synced from CollegeFootballData (teams, games, lines, stats).
--      Rows with source = 'manual' are hand-entered and never overwritten by sync.
--   2. Game state (profiles, leagues, entries, picks). Picks belong to an *entry*
--      (one profile in one league for one season), so more users later is just more rows.
--   3. Guard rails the app can't bypass by accident: the lock-at-kickoff trigger and the
--      single-use unique index on picks.

-- ============================================================================
-- Types
-- ============================================================================

-- Declared strongest first, so enum ordering can be compared (fbs < fcs < ii < iii).
create type public.classification as enum ('fbs', 'fcs', 'ii', 'iii');
create type public.season_type as enum ('regular', 'postseason');
create type public.data_source as enum ('cfbd', 'manual');
create type public.pick_slot as enum ('QB', 'RB', 'WRTE');
create type public.pick_status as enum ('pending', 'locked', 'final', 'dnp');
create type public.week_rule as enum ('standard', 'conference', 'underdog');
create type public.member_role as enum ('owner', 'member');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- Reference data (synced from CFBD)
-- ============================================================================

create table public.seasons (
  id bigint generated always as identity primary key,
  year int not null unique,
  -- Scoring knobs live in data so a rule change next year isn't a code change.
  scoring_rules jsonb not null default
    '{"passYdsPerPoint": 25, "rushYdsPerPoint": 10, "recYdsPerPoint": 10, "touchdown": 6, "turnover": -2}',
  created_at timestamptz not null default now()
);

create table public.conferences (
  id bigint generated always as identity primary key,
  name text not null unique,                 -- CFBD's name, e.g. 'Big Ten'; games reference conferences by name
  abbreviation text,
  cfbd_id int unique,
  created_at timestamptz not null default now()
);

create table public.teams (
  id bigint generated always as identity primary key,
  cfbd_id int not null unique,
  school text not null,
  abbreviation text,
  mascot text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conference and division per season: teams realign and move up from FCS to FBS.
create table public.team_seasons (
  team_id bigint not null references public.teams (id) on delete cascade,
  season_id bigint not null references public.seasons (id) on delete cascade,
  conference_id bigint references public.conferences (id),   -- null = independent
  classification public.classification not null,
  primary key (team_id, season_id)
);

create table public.players (
  id bigint generated always as identity primary key,
  cfbd_id bigint unique,                     -- null for players added by hand
  name text not null,
  source public.data_source not null default 'cfbd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Team and position per season: players transfer between seasons.
create table public.player_seasons (
  player_id bigint not null references public.players (id) on delete cascade,
  season_id bigint not null references public.seasons (id) on delete cascade,
  team_id bigint not null references public.teams (id),
  position text,                             -- as CFBD reports it (QB, RB, WR, TE, FB, ATH, ...)
  position_override text check (position_override in ('QB', 'RB', 'WR', 'TE')),
  jersey smallint,
  primary key (player_id, season_id)
);
create index player_seasons_team_idx on public.player_seasons (season_id, team_id);

create table public.games (
  id bigint generated always as identity primary key,
  cfbd_id bigint not null unique,
  season_id bigint not null references public.seasons (id) on delete cascade,
  season_type public.season_type not null default 'regular',
  week smallint not null check (week >= 0),
  home_team_id bigint not null references public.teams (id),
  away_team_id bigint not null references public.teams (id),
  kickoff_at timestamptz not null,
  start_time_tbd boolean not null default false,
  neutral_site boolean not null default false,
  conference_game boolean not null default false,   -- CFBD's flag; the conference-week rule re-checks team conferences
  completed boolean not null default false,
  home_points smallint,
  away_points smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index games_week_idx on public.games (season_id, season_type, week);
create index games_home_team_idx on public.games (home_team_id);
create index games_away_team_idx on public.games (away_team_id);

create table public.game_lines (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games (id) on delete cascade,
  provider text not null,                    -- 'DraftKings', 'Bovada', ... or 'manual'
  spread_home numeric(4, 1),                 -- negative = home team favored (CFBD convention)
  spread_open_home numeric(4, 1),
  source public.data_source not null default 'cfbd',
  fetched_at timestamptz not null default now(),
  unique (game_id, provider)
);

-- Raw box-score numbers. Points are derived from these, never stored here.
create table public.player_game_stats (
  player_id bigint not null references public.players (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  team_id bigint not null references public.teams (id),
  pass_yds int not null default 0,
  rush_yds int not null default 0,
  rec_yds int not null default 0,
  pass_td smallint not null default 0,
  rush_td smallint not null default 0,
  rec_td smallint not null default 0,
  interceptions smallint not null default 0,
  fumbles_lost smallint not null default 0,
  -- Box scores only list players who recorded a stat. A manual row with appeared = true and
  -- zero stats records "played but did nothing" (burned); appeared = false records a DNP.
  appeared boolean not null default true,
  source public.data_source not null default 'cfbd',
  note text,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);
create index player_game_stats_game_idx on public.player_game_stats (game_id);

-- ============================================================================
-- Game state
-- ============================================================================

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  -- Null until login exists. Friends whose picks are imported from the sheet may never log in.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id bigint not null references public.leagues (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (league_id, profile_id)
);
create index league_members_profile_idx on public.league_members (profile_id);

-- Special weeks only; a week with no row is a standard week.
create table public.league_weeks (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season_id bigint not null references public.seasons (id) on delete cascade,
  week smallint not null check (week >= 0),
  rule public.week_rule not null default 'standard',
  primary key (league_id, season_id, week)
);

-- One profile playing one season in one league. Picks hang off this.
create table public.entries (
  id bigint generated always as identity primary key,
  league_id bigint not null,
  season_id bigint not null references public.seasons (id) on delete cascade,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  unique (league_id, season_id, profile_id),
  -- An entry's profile must be a member of the league.
  foreign key (league_id, profile_id) references public.league_members (league_id, profile_id) on delete cascade
);
create index entries_profile_idx on public.entries (profile_id);

create table public.picks (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.entries (id) on delete cascade,
  week smallint not null check (week >= 0),
  slot public.pick_slot not null,
  player_id bigint not null references public.players (id),
  game_id bigint not null references public.games (id),
  team_id bigint not null references public.teams (id),
  status public.pick_status not null default 'pending',
  points smallint,                           -- set when the game is final; recomputable from stats
  spread_at_pick numeric(4, 1),              -- picked team's spread when picked (negative = favored)
  review_reason text,                        -- non-null puts the pick in the admin review queue
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, week, slot)
);
create index picks_player_idx on public.picks (player_id);
create index picks_game_idx on public.picks (game_id);

-- Single-use rule: a player can be used once per entry, unless that pick was a DNP.
-- A pending pick also counts, so the same player can't be queued in two weeks.
create unique index picks_one_use_per_player on public.picks (entry_id, player_id) where status <> 'dnp';

-- ============================================================================
-- Lock and integrity rules for picks
-- ============================================================================

-- When a game's picks lock. Kickoff, except games with no announced time: those lock at
-- noon Eastern on game day so a TBD game can't be picked after it has started.
create function public.game_lock_at(kickoff timestamptz, time_tbd boolean)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when time_tbd then ((kickoff at time zone 'America/New_York')::date + time '12:00') at time zone 'America/New_York'
    else kickoff
  end;
$$;

create function public.is_game_locked(p_game_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.game_lock_at(g.kickoff_at, g.start_time_tbd) <= now()
  from public.games g
  where g.id = p_game_id;
$$;

-- Enforces, for every write to picks:
--   * the pick's game, week, season and team agree with each other and with the player's roster row
--   * no inserts, deletes, or changes to *what* was picked once the game has locked
-- Status, points and review fields may change after lock (that's how scoring works).
-- Historical imports (Josh's sheet) set `pickem.bypass_lock = on` for their transaction.
create function public.picks_enforce_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bypass boolean := coalesce(current_setting('pickem.bypass_lock', true), '') = 'on';
  g public.games%rowtype;
  entry_season bigint;
begin
  if tg_op = 'DELETE' then
    if not bypass and public.is_game_locked(old.game_id) then
      raise exception 'pick_locked: cannot remove a pick after its game has kicked off'
        using errcode = 'P0001', hint = 'pick_locked';
    end if;
    return old;
  end if;

  -- Consistency checks (always on, even for imports).
  select * into g from public.games where id = new.game_id;
  select season_id into entry_season from public.entries where id = new.entry_id;

  if g.season_id <> entry_season then
    raise exception 'pick_invalid: game is not in the entry''s season' using hint = 'pick_invalid';
  end if;
  if g.week <> new.week then
    raise exception 'pick_invalid: game is in week %, pick is for week %', g.week, new.week using hint = 'pick_invalid';
  end if;
  if new.team_id not in (g.home_team_id, g.away_team_id) then
    raise exception 'pick_invalid: team is not playing in that game' using hint = 'pick_invalid';
  end if;
  if not exists (
    select 1 from public.player_seasons ps
    where ps.player_id = new.player_id and ps.season_id = entry_season and ps.team_id = new.team_id
  ) then
    raise exception 'pick_invalid: player is not on that team''s roster this season' using hint = 'pick_invalid';
  end if;

  if bypass then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.is_game_locked(new.game_id) then
      raise exception 'pick_locked: that game has already kicked off' using hint = 'pick_locked';
    end if;
  elsif (new.entry_id, new.week, new.slot, new.player_id, new.game_id, new.team_id)
        is distinct from (old.entry_id, old.week, old.slot, old.player_id, old.game_id, old.team_id) then
    if public.is_game_locked(old.game_id) then
      raise exception 'pick_locked: the current pick''s game has already kicked off' using hint = 'pick_locked';
    end if;
    if public.is_game_locked(new.game_id) then
      raise exception 'pick_locked: that game has already kicked off' using hint = 'pick_locked';
    end if;
  end if;

  return new;
end;
$$;

create trigger picks_enforce_rules
  before insert or update or delete on public.picks
  for each row execute function public.picks_enforce_rules();

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger player_game_stats_set_updated_at before update on public.player_game_stats
  for each row execute function public.set_updated_at();
create trigger picks_set_updated_at before update on public.picks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- On for every table, with no policies yet: the public (anon) and logged-in (authenticated)
-- API roles can read and write nothing. Only server code using the secret key (service_role,
-- which bypasses RLS) can reach the data. Policies get added when login arrives.

alter table public.seasons enable row level security;
alter table public.conferences enable row level security;
alter table public.teams enable row level security;
alter table public.team_seasons enable row level security;
alter table public.players enable row level security;
alter table public.player_seasons enable row level security;
alter table public.games enable row level security;
alter table public.game_lines enable row level security;
alter table public.player_game_stats enable row level security;
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_weeks enable row level security;
alter table public.entries enable row level security;
alter table public.picks enable row level security;

-- Explicit grants so the server's service_role works regardless of the project's default privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
