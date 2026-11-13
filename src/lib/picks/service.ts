import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chooseSpread,
  lockAt,
  SLOT_POSITIONS,
  underdogStatus,
  validatePick,
  type Candidate,
  type Classification,
  type EntryPick,
  type GameInfo,
  type GameSide,
  type PickStatus,
  type Slot,
  type Violation,
  type WeekRule,
} from "@/lib/rules";
import type { Database } from "@/lib/supabase/database.types";
import { must, ok } from "@/lib/supabase/helpers";

type Db = SupabaseClient<Database>;

/** The seeded owner profile (Odin). Used only as a default selection on admin pages. */
export const OWNER_PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const LEAGUE_SLUG = "main";

export type TeamRef = { id: number; school: string; abbreviation: string | null; logoUrl: string | null; conference: string | null };

export type WeekGame = GameInfo & {
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  kickoffAt: Date;
  startTimeTbd: boolean;
  completed: boolean;
  homePoints: number | null;
  awayPoints: number | null;
};

export type SeasonPick = EntryPick & {
  pickId: number;
  gameId: number;
  teamId: number;
  points: number | null;
  reviewReason: string | null;
  spreadAtPick: number | null;
  playerName: string;
  position: string | null;
  team: TeamRef;
};

export type WeekContext = {
  year: number;
  seasonId: number;
  leagueId: number;
  entryId: number;
  week: number;
  weekRule: WeekRule;
  games: WeekGame[];
  /** The game each team plays this week (its earliest if it somehow has two). */
  gameByTeam: Map<number, WeekGame>;
  /** Every pick this entry has made this season. */
  entryPicks: SeasonPick[];
};

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type TeamRow = {
  id: number;
  school: string;
  abbreviation: string | null;
  logo_url: string | null;
  team_seasons: { season_id: number; classification: Classification; conference_id: number | null; conferences: { name: string } | null }[];
};

const TEAM_FIELDS = "id, school, abbreviation, logo_url, team_seasons(season_id, classification, conference_id, conferences(name))";

function teamRef(t: TeamRow, seasonId: number): TeamRef {
  const ts = t.team_seasons.find((s) => s.season_id === seasonId);
  return { id: t.id, school: t.school, abbreviation: t.abbreviation, logoUrl: t.logo_url, conference: ts?.conferences?.name ?? null };
}

function gameSide(t: TeamRow, seasonId: number): GameSide {
  const ts = t.team_seasons.find((s) => s.season_id === seasonId);
  return { teamId: t.id, classification: ts?.classification ?? null, conferenceId: ts?.conference_id ?? null };
}

/** The week as seen by one member's entry (the signed-in member). */
export async function loadWeekContext(db: Db, year: number, week: number, profileId: string): Promise<WeekContext> {
  const entry = must(
    await db
      .from("entries")
      .select("id, league_id, season_id, leagues!inner(slug), seasons!inner(year)")
      .eq("profile_id", profileId)
      .eq("leagues.slug", LEAGUE_SLUG)
      .eq("seasons.year", year)
      .maybeSingle(),
    `load ${year} entry`,
  );
  const seasonId = entry.season_id;

  const [ruleRow, gameRows, pickRows] = await Promise.all([
    db
      .from("league_weeks")
      .select("rule")
      .eq("league_id", entry.league_id)
      .eq("season_id", seasonId)
      .eq("week", week)
      .maybeSingle(),
    db
      .from("games")
      .select(
        `id, week, kickoff_at, start_time_tbd, completed, home_points, away_points,
         home:teams!games_home_team_id_fkey(${TEAM_FIELDS}),
         away:teams!games_away_team_id_fkey(${TEAM_FIELDS}),
         game_lines(provider, spread_home, source)`,
      )
      .eq("season_id", seasonId)
      .eq("season_type", "regular")
      .eq("week", week)
      .order("kickoff_at"),
    db
      .from("picks")
      .select(
        `id, week, slot, status, points, review_reason, spread_at_pick, player_id, game_id, team_id,
         players(name, player_seasons(season_id, position, position_override)),
         teams(${TEAM_FIELDS}),
         games(kickoff_at, start_time_tbd)`,
      )
      .eq("entry_id", entry.id)
      .order("week"),
  ]);

  const games: WeekGame[] = must(gameRows, "load games").map((g) => {
    const home = g.home as unknown as TeamRow;
    const away = g.away as unknown as TeamRow;
    const kickoffAt = new Date(g.kickoff_at);
    return {
      id: g.id,
      week: g.week,
      kickoffAt,
      startTimeTbd: g.start_time_tbd,
      lockAt: lockAt(kickoffAt, g.start_time_tbd),
      completed: g.completed,
      homePoints: g.home_points,
      awayPoints: g.away_points,
      home: gameSide(home, seasonId),
      away: gameSide(away, seasonId),
      homeTeam: teamRef(home, seasonId),
      awayTeam: teamRef(away, seasonId),
      spreadHome: chooseSpread(
        g.game_lines.map((l) => ({ provider: l.provider, spreadHome: l.spread_home === null ? null : Number(l.spread_home), source: l.source })),
      ),
    };
  });

  const gameByTeam = new Map<number, WeekGame>();
  for (const g of games) {
    for (const teamId of [g.home.teamId, g.away.teamId]) {
      if (!gameByTeam.has(teamId)) gameByTeam.set(teamId, g); // games are ordered by kickoff
    }
  }

  const entryPicks: SeasonPick[] = must(pickRows, "load picks").map((p) => {
    const team = p.teams as unknown as TeamRow;
    const ps = p.players.player_seasons.find((s) => s.season_id === seasonId);
    return {
      pickId: p.id,
      week: p.week,
      slot: p.slot,
      playerId: p.player_id,
      gameId: p.game_id,
      teamId: p.team_id,
      status: p.status as PickStatus,
      points: p.points,
      reviewReason: p.review_reason,
      spreadAtPick: p.spread_at_pick === null ? null : Number(p.spread_at_pick),
      lockAt: lockAt(new Date(p.games.kickoff_at), p.games.start_time_tbd),
      teamConferenceId: gameSide(team, seasonId).conferenceId,
      playerName: p.players.name,
      position: ps?.position_override ?? ps?.position ?? null,
      team: teamRef(team, seasonId),
    };
  });

  return {
    year,
    seasonId,
    leagueId: entry.league_id,
    entryId: entry.id,
    week,
    weekRule: (ruleRow.data?.rule ?? "standard") as WeekRule,
    games,
    gameByTeam,
    entryPicks,
  };
}

/** The team's spread from its own side (negative = favored), or null with no line. */
export function teamSpread(game: GameInfo, teamId: number): number | null {
  if (game.spreadHome === null) return null;
  return game.home.teamId === teamId ? game.spreadHome : -game.spreadHome;
}

/**
 * Problems with this week's existing picks under the current rules (e.g. the week was switched
 * to Underdog after picking). Lock-related codes are left out: a locked pick is fine as-is.
 */
export function pickWarnings(ctx: WeekContext, pick: SeasonPick, now: Date): Violation[] {
  const game = ctx.gameByTeam.get(pick.teamId);
  if (!game) return [];
  const candidate: Candidate = { playerId: pick.playerId, teamId: pick.teamId, position: pick.position, game };
  return validatePick(candidate, { now, week: ctx.week, slot: pick.slot, weekRule: ctx.weekRule, entryPicks: ctx.entryPicks }).filter(
    (v) => v.code !== "locked" && v.code !== "slot_locked",
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type CandidateResult = {
  playerId: number;
  name: string;
  position: string | null;
  jersey: number | null;
  team: TeamRef;
  opponent: TeamRef;
  isHome: boolean;
  lockAt: string;
  teamSpread: number | null;
  underdog: boolean;
  violations: Violation[];
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Players matching `query` by name or team who could fill `slot` this week, eligible ones first.
 * Ineligible players are included (with reasons) so the UI can explain why they're greyed out.
 */
export async function searchCandidates(db: Db, ctx: WeekContext, slot: Slot, query: string, now: Date): Promise<CandidateResult[]> {
  const q = query.trim();
  if (q.length < 2 || ctx.games.length === 0) return [];

  const positions = SLOT_POSITIONS[slot].join(",");
  const weekTeamIds = [...ctx.gameByTeam.keys()];
  const needle = q.toLowerCase();
  const teamMatches = ctx.games
    .flatMap((g) => [g.homeTeam, g.awayTeam])
    .filter((t) => t.school.toLowerCase().includes(needle) || t.abbreviation?.toLowerCase() === needle)
    .map((t) => t.id);

  const base = () =>
    db
      .from("player_seasons")
      .select("player_id, team_id, position, position_override, jersey, players!inner(name)")
      .eq("season_id", ctx.seasonId)
      .or(`position.in.(${positions}),position_override.in.(${positions})`);

  const [byName, byTeam] = await Promise.all([
    base().in("team_id", weekTeamIds).ilike("players.name", `%${escapeLike(q)}%`).limit(60),
    teamMatches.length ? base().in("team_id", teamMatches).limit(150) : Promise.resolve({ data: [], error: null }),
  ]);

  const rows = [...must(byName, "search players by name"), ...must(byTeam, "search players by team")];
  const seen = new Set<number>();
  const results: CandidateResult[] = [];

  for (const r of rows) {
    if (seen.has(r.player_id)) continue;
    seen.add(r.player_id);
    const position = r.position_override ?? r.position;
    if (!position || !SLOT_POSITIONS[slot].includes(position)) continue; // override moved him out of this slot
    const game = ctx.gameByTeam.get(r.team_id);
    if (!game) continue;

    const isHome = game.home.teamId === r.team_id;
    const violations = validatePick(
      { playerId: r.player_id, teamId: r.team_id, position, game },
      { now, week: ctx.week, slot, weekRule: ctx.weekRule, entryPicks: ctx.entryPicks },
    );
    results.push({
      playerId: r.player_id,
      name: r.players.name,
      position,
      jersey: r.jersey,
      team: isHome ? game.homeTeam : game.awayTeam,
      opponent: isHome ? game.awayTeam : game.homeTeam,
      isHome,
      lockAt: game.lockAt.toISOString(),
      teamSpread: teamSpread(game, r.team_id),
      underdog: underdogStatus(game, r.team_id) === "underdog",
      violations,
    });
  }

  // Eligible first; then an exact team match ("alabama" → Alabama before North Alabama); then name.
  const exactTeam = (r: CandidateResult) => (r.team.school.toLowerCase() === needle ? 0 : 1);
  return results
    .sort(
      (a, b) =>
        Number(a.violations.length > 0) - Number(b.violations.length > 0) ||
        exactTeam(a) - exactTeam(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type WriteResult = { ok: true } | { ok: false; errors: string[] };

/** Turns database refusals (lock trigger, single-use index) into readable messages. */
function describeDbError(message: string, code: string | undefined): string {
  if (message.includes("pick_locked")) return "That game has already kicked off.";
  if (code === "23505") return "That player has already been used this season.";
  if (message.includes("pick_invalid")) return message.replace(/^pick_invalid:\s*/, "");
  return message;
}

/** Validates against fresh data, then saves (or replaces) the pick for this week and slot. */
export async function savePick(db: Db, ctx: WeekContext, slot: Slot, playerId: number, now: Date): Promise<WriteResult> {
  const ps = must(
    await db
      .from("player_seasons")
      .select("team_id, position, position_override")
      .eq("player_id", playerId)
      .eq("season_id", ctx.seasonId)
      .maybeSingle(),
    "load player",
  );
  const game = ctx.gameByTeam.get(ps.team_id);
  if (!game) return { ok: false, errors: ["His team doesn't play this week."] };

  const violations = validatePick(
    { playerId, teamId: ps.team_id, position: ps.position_override ?? ps.position, game },
    { now, week: ctx.week, slot, weekRule: ctx.weekRule, entryPicks: ctx.entryPicks },
  );
  if (violations.length) return { ok: false, errors: violations.map((v) => v.message) };

  const { error } = await db.from("picks").upsert(
    {
      entry_id: ctx.entryId,
      week: ctx.week,
      slot,
      player_id: playerId,
      game_id: game.id,
      team_id: ps.team_id,
      status: "pending",
      points: null,
      review_reason: null,
      spread_at_pick: teamSpread(game, ps.team_id),
      entered_via: "app",
    },
    { onConflict: "entry_id,week,slot" },
  );
  return error ? { ok: false, errors: [describeDbError(error.message, error.code)] } : { ok: true };
}

export async function removePick(db: Db, ctx: WeekContext, slot: Slot): Promise<WriteResult> {
  const pick = ctx.entryPicks.find((p) => p.week === ctx.week && p.slot === slot);
  if (!pick) return { ok: true };
  const { error } = await db.from("picks").delete().eq("id", pick.pickId);
  return error ? { ok: false, errors: [describeDbError(error.message, error.code)] } : { ok: true };
}

/** Standard weeks have no row; special weeks get one. */
export async function setWeekRule(db: Db, ctx: WeekContext, rule: WeekRule): Promise<void> {
  const key = { league_id: ctx.leagueId, season_id: ctx.seasonId, week: ctx.week };
  if (rule === "standard") {
    ok(
      await db.from("league_weeks").delete().eq("league_id", key.league_id).eq("season_id", key.season_id).eq("week", key.week),
      "clear week rule",
    );
  } else {
    ok(await db.from("league_weeks").upsert({ ...key, rule }, { onConflict: "league_id,season_id,week" }), "set week rule");
  }
}
