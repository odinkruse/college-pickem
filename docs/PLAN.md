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

## CFBD sync (Phase 3)

Code: `src/lib/sync/`. Run from `/admin` (password: `ADMIN_PASSWORD`, any username) or
`npm run sync -- [all|teams|games|rosters|lines] [year]`. Each run is logged in `sync_runs`.

| Sync | CFBD calls | Notes |
|---|---|---|
| teams | 1 (`/teams?year`) | All ~680 teams, all divisions. Conferences are derived from team conference names (CFBD's `/conferences` repeats names across eras). |
| games | 2 (`/games` fbs + fcs, regular season) | Deduped; FBS-vs-FCS games are in both lists. Opponents missing from `/teams` are created bare. |
| rosters | 1 (`/roster?year`, all teams, ~9 MB) | FBS/FCS teams only; positions QB/RB/FB/WR/TE/ATH/unlisted. Roster ids match box-score athlete ids (100% in the week 10 test). Never touches `position_override`. |
| lines | 1 (`/lines?year`, whole season) | Upsert by (game, provider); manual lines use provider `manual` so sync never collides. |

First 2026 sync: 682 teams, 1,608 games, 9,322 skill players, 2,041 lines, ~16 s total.
Re-running is idempotent. Includes 46 FCS-vs-D-II games, which the division rule must reject.

## Data model

Source of truth: `supabase/migrations/`. Summary:

- Reference (synced): `seasons` (`scoring_rules` jsonb), `conferences`, `teams`, `team_seasons`
  (conference + classification per year), `players`, `player_seasons` (team + position per year,
  `position_override`), `games`, `game_lines` (`spread_home`, negative = home favored),
  `player_game_stats` (raw stats + `appeared` + `source cfbd|manual`).
- Game state: `profiles` (`auth_user_id` nullable until login exists), `leagues` (`slug`),
  `league_members`, `entries` (league × season × profile), `league_weeks` (special weeks only;
  no row = standard), `picks` (`review_reason` non-null = in the admin review queue).
- Conference week has no "declared conference" column: the conference is whatever the entry's first
  pick that week implies, and the rules engine requires the other picks to match.
- Single use: `unique (entry_id, player_id) where status <> 'dnp'` on picks.
- Trigger `picks_enforce_rules`: pick week/season/team must match its game and the player's roster row;
  no insert/delete/change of the picked player/game after lock. Status/points may change after lock.
  Lock = kickoff, or noon ET on game day when the time is TBD (`game_lock_at`).
  Historical imports set `pickem.bypass_lock = on` for their transaction.
- Manual rows (`source = 'manual'`) are never overwritten by sync.
- RLS is on everywhere with no policies. The publishable key can read and write nothing (verified).

### Database workflow (no local Docker)

- New migration: `supabase migration new <name>`, write SQL, then `npm run db:push`. Never edit a
  migration that has already been pushed — add a new one.
- After schema changes: `npm run db:types` regenerates `src/lib/supabase/database.types.ts`.
- `npm run db:test` runs `supabase/tests/pick_rules.sql` against the hosted DB inside a rolled-back
  transaction (11 checks).
- Seed (`supabase/seed.sql`, idempotent): seasons 2026–2027, profile "Odin", league `main`, entries.

## Rule enforcement

1. `src/lib/rules/` — pure TypeScript, no I/O, unit-tested with Vitest (`npm test`, 59 tests). Used by
   both the UI (to grey out ineligible players) and Server Actions (before writing).
   - `validatePick(candidate, ctx)` returns *every* violation (codes like `already_used`, `favored`,
     `lower_division_opponent`), not just the first, so the UI can explain all of them.
   - `scoreBreakdown` / `scoreStatLine`: per-category truncation toward zero.
   - `resolvePick`: pending → locked → final/dnp. **A final game with no box-score row is burned with
     0 points and flagged for review, not released.** Releasing by default would let the player be
     re-picked, and a later "he did play" would then break single use retroactively. Confirming the DNP
     (manual stats row, `appeared = false`) releases him.
   - `underdogStatus`: from the team's side, spread < 0 is favored; 0 (pick'em) or positive is an
     underdog; no line while facing a higher division is an underdog; otherwise unknown (enter a line).
   - `chooseSpread`: manual line, then DraftKings, ESPN Bet, Bovada, then any.
   - `lockAt`: mirrors the DB's `game_lock_at`.
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
| 1 | Scaffold: Next.js 16, Tailwind 4, shadcn/ui, Supabase client, Vercel deploy, status page | ✅ done — live at https://college-pickem-phi.vercel.app |
| 2 | Schema: migrations, seed, generated types, RLS on | ✅ done |
| 3 | Reference sync: teams, games, rosters, lines + admin "Sync now" | ✅ done |
| 4 | Rules engine + Vitest tests | ✅ done |
| 5 | Picks UI: week view, eligible-player search, lock countdown, Server Actions, lock trigger | |
| 6 | Stats sync + scoring + DNP review queue + history / burned list | |
| 7 | Manual overrides admin | |
| 8 | League pick import (Josh's sheet / email) + standings — backfill 2026 for testing | |
| 9 | Scheduling: Supabase `pg_cron` → sync endpoint (Vercel Hobby cron is daily only) | |
| 10 | Multi-user: Supabase Auth, RLS policies, picks hidden until locked | |
