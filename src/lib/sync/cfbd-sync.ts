import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchGames,
  fetchLines,
  fetchRosters,
  fetchTeams,
  type CfbdGame,
  type CfbdUsage,
} from "@/lib/cfbd";
import type { Database, TablesInsert } from "@/lib/supabase/database.types";
import { chunks, dedupeBy, must, ok, selectAll } from "@/lib/supabase/helpers";

type Db = SupabaseClient<Database>;
export type SyncContext = { db: Db; year: number; seasonId: number; usage: CfbdUsage };
export type SyncSummary = Record<string, number | string>;

/** Roster positions worth storing: anything that could fill a QB, RB or WR/TE slot. Null = unlisted. */
const SKILL_POSITIONS = new Set(["QB", "RB", "FB", "WR", "TE", "ATH"]);

// ---------------------------------------------------------------------------
// Teams + conferences (1 CFBD call)
// ---------------------------------------------------------------------------

export async function syncTeams({ db, year, seasonId, usage }: SyncContext): Promise<SyncSummary> {
  const teams = await fetchTeams(year, usage);

  // Conferences come from the teams' conference names: CFBD's /conferences list repeats names
  // across eras, and games and teams only ever refer to conferences by name.
  const conferenceNames = [...new Set(teams.map((t) => t.conference).filter((c): c is string => !!c))];
  const conferences = must(
    await db
      .from("conferences")
      .upsert(conferenceNames.map((name) => ({ name })), { onConflict: "name" })
      .select("id, name"),
    "upsert conferences",
  );
  const conferenceId = new Map(conferences.map((c) => [c.name, c.id]));

  const teamIds = new Map<number, number>();
  for (const batch of chunks(dedupeBy(teams, (t) => t.id))) {
    const rows: TablesInsert<"teams">[] = batch.map((t) => ({
      cfbd_id: t.id,
      school: t.school,
      mascot: t.mascot,
      abbreviation: t.abbreviation,
      logo_url: t.logos?.[0] ?? null,
    }));
    const saved = must(await db.from("teams").upsert(rows, { onConflict: "cfbd_id" }).select("id, cfbd_id"), "upsert teams");
    for (const t of saved) teamIds.set(t.cfbd_id, t.id);
  }

  const teamSeasons: TablesInsert<"team_seasons">[] = teams
    .filter((t) => t.classification)
    .map((t) => ({
      team_id: teamIds.get(t.id)!,
      season_id: seasonId,
      classification: t.classification!,
      conference_id: t.conference ? (conferenceId.get(t.conference) ?? null) : null,
    }));
  for (const batch of chunks(teamSeasons)) {
    ok(await db.from("team_seasons").upsert(batch, { onConflict: "team_id,season_id" }), "upsert team_seasons");
  }

  return { teams: teamIds.size, conferences: conferences.length, withDivision: teamSeasons.length };
}

// ---------------------------------------------------------------------------
// Games (2 CFBD calls: FBS and FCS lists; FBS-vs-FCS games appear in both)
// ---------------------------------------------------------------------------

export async function syncGames({ db, year, seasonId, usage }: SyncContext): Promise<SyncSummary> {
  const teamIds = await loadTeamIds(db);
  if (teamIds.size === 0) throw new Error("No teams yet. Sync teams first.");

  const [fbs, fcs] = await Promise.all([fetchGames(year, "fbs", usage), fetchGames(year, "fcs", usage)]);
  const games = dedupeBy([...fbs, ...fcs], (g) => g.id).filter((g) => g.season === year);

  // An opponent CFBD's /teams didn't list (rare): create a bare team so the game can be stored.
  const created = await createMissingTeams(db, games, teamIds, seasonId);

  for (const batch of chunks(games)) {
    const rows: TablesInsert<"games">[] = batch.map((g) => ({
      cfbd_id: g.id,
      season_id: seasonId,
      season_type: g.seasonType,
      week: g.week,
      home_team_id: teamIds.get(g.homeId)!,
      away_team_id: teamIds.get(g.awayId)!,
      kickoff_at: g.startDate,
      start_time_tbd: g.startTimeTBD,
      neutral_site: g.neutralSite,
      conference_game: g.conferenceGame,
      completed: g.completed,
      home_points: g.homePoints,
      away_points: g.awayPoints,
    }));
    ok(await db.from("games").upsert(rows, { onConflict: "cfbd_id" }), "upsert games");
  }

  return {
    games: games.length,
    completed: games.filter((g) => g.completed).length,
    timeTbd: games.filter((g) => g.startTimeTBD && !g.completed).length,
    teamsCreated: created,
  };
}

async function createMissingTeams(db: Db, games: CfbdGame[], teamIds: Map<number, number>, seasonId: number) {
  const missing = new Map<number, { school: string; classification: CfbdGame["homeClassification"] }>();
  for (const g of games) {
    if (!teamIds.has(g.homeId)) missing.set(g.homeId, { school: g.homeTeam, classification: g.homeClassification });
    if (!teamIds.has(g.awayId)) missing.set(g.awayId, { school: g.awayTeam, classification: g.awayClassification });
  }
  if (missing.size === 0) return 0;

  const saved = must(
    await db
      .from("teams")
      .upsert([...missing].map(([cfbdId, t]) => ({ cfbd_id: cfbdId, school: t.school })), { onConflict: "cfbd_id" })
      .select("id, cfbd_id"),
    "create missing teams",
  );
  for (const t of saved) teamIds.set(t.cfbd_id, t.id);

  const seasons = [...missing]
    .filter(([, t]) => t.classification)
    .map(([cfbdId, t]) => ({ team_id: teamIds.get(cfbdId)!, season_id: seasonId, classification: t.classification! }));
  if (seasons.length) {
    ok(
      await db.from("team_seasons").upsert(seasons, { onConflict: "team_id,season_id", ignoreDuplicates: true }),
      "create missing team_seasons",
    );
  }
  return missing.size;
}

// ---------------------------------------------------------------------------
// Rosters (1 CFBD call, ~9 MB). FBS and FCS teams, skill positions only.
// ---------------------------------------------------------------------------

export async function syncRosters({ db, year, seasonId, usage }: SyncContext): Promise<SyncSummary> {
  const teamSeasons = await selectAll("load team_seasons", (from, to) =>
    db
      .from("team_seasons")
      .select("team_id, classification, teams(school)")
      .eq("season_id", seasonId)
      .in("classification", ["fbs", "fcs"])
      .order("team_id")
      .range(from, to),
  );
  if (teamSeasons.length === 0) throw new Error("No FBS/FCS teams for this season yet. Sync teams first.");
  const teamBySchool = new Map(teamSeasons.map((ts) => [ts.teams.school, ts.team_id]));

  const roster = await fetchRosters(year, usage);
  const eligible = dedupeBy(
    roster.filter((p) => teamBySchool.has(p.team) && (p.position === null || SKILL_POSITIONS.has(p.position))),
    (p) => p.id,
  );

  let saved = 0;
  for (const batch of chunks(eligible, 1000)) {
    const players = must(
      await db
        .from("players")
        .upsert(
          batch.map((p) => ({
            cfbd_id: Number(p.id),
            name: [p.firstName, p.lastName].filter(Boolean).join(" ") || `Player ${p.id}`,
            source: "cfbd" as const,
          })),
          { onConflict: "cfbd_id" },
        )
        .select("id, cfbd_id"),
      "upsert players",
    );
    const playerId = new Map(players.map((p) => [p.cfbd_id, p.id]));

    // position_override is intentionally not in the payload, so hand-set overrides survive re-syncs.
    const seasons: TablesInsert<"player_seasons">[] = batch.map((p) => ({
      player_id: playerId.get(Number(p.id))!,
      season_id: seasonId,
      team_id: teamBySchool.get(p.team)!,
      position: p.position,
      jersey: p.jersey,
    }));
    ok(await db.from("player_seasons").upsert(seasons, { onConflict: "player_id,season_id" }), "upsert player_seasons");
    saved += batch.length;
  }

  const byPosition = (pos: string | null) => eligible.filter((p) => p.position === pos).length;
  return {
    players: saved,
    QB: byPosition("QB"),
    RB: byPosition("RB") + byPosition("FB"),
    WR: byPosition("WR"),
    TE: byPosition("TE"),
    unlisted: byPosition(null) + byPosition("ATH"),
  };
}

// ---------------------------------------------------------------------------
// Lines (1 CFBD call for the whole regular season)
// ---------------------------------------------------------------------------

export async function syncLines({ db, year, seasonId, usage }: SyncContext): Promise<SyncSummary> {
  const games = await selectAll("load games", (from, to) =>
    db.from("games").select("id, cfbd_id").eq("season_id", seasonId).order("id").range(from, to),
  );
  if (games.length === 0) throw new Error("No games for this season yet. Sync games first.");
  const gameId = new Map(games.map((g) => [g.cfbd_id, g.id]));

  const lines = await fetchLines(year, usage);
  const fetchedAt = new Date().toISOString();
  const rows: TablesInsert<"game_lines">[] = dedupeBy(
    lines.flatMap((g) =>
      gameId.has(g.id)
        ? g.lines.map((l) => ({
            game_id: gameId.get(g.id)!,
            provider: l.provider,
            spread_home: l.spread,
            spread_open_home: l.spreadOpen,
            source: "cfbd" as const,
            fetched_at: fetchedAt,
          }))
        : [],
    ),
    (r) => `${r.game_id}|${r.provider}`,
  );

  for (const batch of chunks(rows, 1000)) {
    ok(await db.from("game_lines").upsert(batch, { onConflict: "game_id,provider" }), "upsert game_lines");
  }

  return {
    lines: rows.length,
    gamesWithLines: new Set(rows.map((r) => r.game_id)).size,
    unmatchedGames: lines.filter((g) => !gameId.has(g.id)).length,
  };
}

// ---------------------------------------------------------------------------

async function loadTeamIds(db: Db): Promise<Map<number, number>> {
  const teams = await selectAll("load teams", (from, to) =>
    db.from("teams").select("id, cfbd_id").order("id").range(from, to),
  );
  return new Map(teams.map((t) => [t.cfbd_id, t.id]));
}
