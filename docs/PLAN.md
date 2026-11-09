# College Pick'em — Plan & Decisions

Living document. Update it when a rule is clarified or a phase finishes.

## Game rules (confirmed)

- ~15-week season. Each week each entry picks one **QB**, one **RB**, one **WR/TE**.
- **Single use:** a player who has been used can't be picked again that season. A picked player who
  **doesn't play** (rule of thumb: zero snaps) is *not* burned and scores 0 for that slot.
- **Scoring** (each category floored separately, truncated toward zero):
  - `trunc(pass_yds / 25) + trunc(rush_yds / 10) + trunc(rec_yds / 10)`
    - 15 rush + 15 rec = 1 + 1 = **2** (categories are never combined)
    - 19 yds = 1; −7 yds = 0; −12 yds = −1
  - **+6** per passing, rushing or receiving TD. Return / special teams / defensive TDs don't count.
  - **−2** per turnover that changes possession: interceptions thrown + fumbles **lost**.
- **Divisions:** FBS and FCS players are eligible. An FCS player facing an FBS opponent is legal. A player
  may not be picked against an opponent from a lower division (rank FBS 4 > FCS 3 > II 2 > III 1;
  legal when opponent rank ≥ player's team rank).
- **Conference week:** each entry chooses its own conference (others may choose the same one). All three
  picks must be from that conference, and in each pick's game **both teams belong to that conference**.
- **Underdog week:** only players whose team is not favored. The line that counts is the one **at kickoff**.
  Lines rarely flip midweek, so the UI checks the current line at pick time and re-checks at lock;
  a flip is flagged for review rather than silently voided. The group uses Score Mobile, which usually
  matches CFBD's lines. A spread of 0 (pick'em) counts as not favored.
- **Lock:** each pick locks at the kickoff of that player's game.

## Phase 0 findings — CFBD coverage (tested 2026 week 10)

| Data | FBS | FCS |
|---|---|---|
| `/games?classification=` | 63 games | 62 games. Each game includes both teams' classification + conference |
| `/games/players` box scores | 63/63 games | **62/62 games**, all with passing/rushing/receiving/fumbles |
| `/lines` | 62/62 with a spread | **61/61 FCS-vs-FCS games had a DraftKings spread**; FBS-vs-FCS too |

- Spread is from the home team's perspective (negative = home favored), e.g. `Drake +1.5` vs San Diego.
- Box scores list only players who recorded a stat. A handful of 0-catch receivers do appear (probably
  targeted but no catch), but a receiver who ran routes and was never targeted will be missing. So
  "no stat row" ≠ "didn't play" → the `appeared` override + a **DNP review queue** is required.
- Box scores include team rows with negative athlete ids (`" Team"`). Skip ids starting with `-`.
- Fumbles have `FUM`, `LOST`, `REC` types. Use `LOST`.
- Week 10 was a single sample. Earlier years and early-season weeks may have more gaps, so the manual
  fallback (enter stat line / line / player by hand) is still in the plan, just lower priority.
- Quota: the free tier is 1,000 calls/month; the response header `x-calllimit-remaining` shows what's left.
  The bulk endpoints (`year+week+classification`) make a full week cost about 6 calls.

## Data model

See the plan in the initial planning session. Summary:

- Reference (synced): `seasons`, `conferences`, `teams`, `team_seasons` (conference + classification per
  year), `players`, `player_seasons` (team + position per year, `position_override`), `games`,
  `game_lines`, `player_game_stats` (raw stats + `appeared` + `source cfbd|manual`).
- Game state: `profiles` (`auth_user_id` nullable until login exists), `leagues`, `league_members`,
  `entries` (league × profile), `league_weeks` (`rule standard|conference|underdog`),
  `entry_week_conference` (each entry's chosen conference for conference week), `picks`.
- Single use is enforced in the database with
  `CREATE UNIQUE INDEX ... ON picks (entry_id, player_id) WHERE status <> 'dnp'`.
- Lock is enforced by a trigger that rejects changes to picks whose (old or new) game has kicked off.
- Manual rows (`source = 'manual'`) are never overwritten by sync.

## Rule enforcement

1. `src/lib/rules/` — pure TypeScript `validatePick()` and `scorePick()`, unit-tested with Vitest. Used
   by both the UI (to grey out ineligible players) and Server Actions (before writing).
2. Postgres constraints and triggers — lock at kickoff, single use, one pick per slot.
3. Row Level Security on every table. In Phase 1 only server code (secret key) touches the database.

## Ingesting the rest of the league

Other people's weekly picks arrive in Josh's Google Sheet or the weekly email. Each friend becomes a
`profile` + `entry` with no login. An import step (sheet first, since it's structured) maps names to
players and writes picks with lock checks bypassed for historical imports.

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | CFBD data spike | ✅ done |
| 1 | Scaffold: Next.js 16, Tailwind 4, shadcn/ui, Supabase client, Vercel deploy, status page | ✅ code done, accounts being connected |
| 2 | Schema: migrations, seed, generated types, RLS on | |
| 3 | Reference sync: teams, games, rosters, lines + admin "Sync now" | |
| 4 | Rules engine + Vitest tests | |
| 5 | Picks UI: week view, eligible-player search, lock countdown, Server Actions, lock trigger | |
| 6 | Stats sync + scoring + DNP review queue + history / burned list | |
| 7 | Manual overrides admin | |
| 8 | League pick import (Josh's sheet / email) + standings — backfill 2026 for testing | |
| 9 | Scheduling: Supabase `pg_cron` → sync endpoint (Vercel Hobby cron is daily only) | |
| 10 | Multi-user: Supabase Auth, RLS policies, picks hidden until locked | |
