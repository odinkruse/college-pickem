import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { parseRules } from "@/lib/picks/scoring";
import { SLOT_POSITIONS, scoreStatLine, type Slot } from "@/lib/rules";
import { leagueLastWeek } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/helpers";
import { playerLeaders, type Division, type PlayerLeaders, type ScoredGame } from "./leaders";

// Every FBS and FCS skill player's box-score lines this season, scored with the league's rules, for the
// player stats page and the home page sidebar. ~30k rows to read, so it's cached; results syncs and
// stat edits call updateTag(PLAYER_STATS_TAG).

export const PLAYER_STATS_TAG = "player-stats";

const SLOT_OF = new Map<string, Slot>(
  (Object.entries(SLOT_POSITIONS) as [Slot, readonly string[]][]).flatMap(([slot, positions]) => positions.map((p) => [p, slot] as const)),
);

export type PlayerStats = PlayerLeaders & { year: number; lastWeek: number; throughWeek: number | null };

export async function loadPlayerStats(year: number): Promise<PlayerStats | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(PLAYER_STATS_TAG);

  const db = createAdminClient();
  const season = (await db.from("seasons").select("id, scoring_rules").eq("year", year).maybeSingle()).data;
  if (!season) return null;
  const rules = parseRules(season.scoring_rules);
  const lastWeek = await leagueLastWeek(year, db);

  const [stats, positions, teams, picks] = await Promise.all([
    selectAll("load player stats", (from, to) =>
      db
        .from("player_game_stats")
        .select(
          "player_id, game_id, team_id, appeared, pass_yds, pass_td, rush_yds, rush_td, rec_yds, rec_td, interceptions, fumbles_lost, games!inner(week, season_id, home_team_id, away_team_id)",
        )
        .eq("games.season_id", season.id)
        .gte("games.week", 1)
        .lte("games.week", lastWeek)
        .order("player_id")
        .order("game_id")
        .range(from, to),
    ),
    selectAll("load positions", (from, to) =>
      db
        .from("player_seasons")
        .select("player_id, position, position_override, players(name)")
        .eq("season_id", season.id)
        .order("player_id")
        .range(from, to),
    ),
    selectAll("load teams", (from, to) =>
      db.from("team_seasons").select("team_id, classification, teams(school)").eq("season_id", season.id).order("team_id").range(from, to),
    ),
    selectAll("load picks", (from, to) =>
      db.from("picks").select("entry_id, player_id, entries!inner(season_id)").eq("entries.season_id", season.id).order("id").range(from, to),
    ),
  ]);

  const playerOf = new Map(positions.map((p) => [p.player_id, { name: p.players.name, slot: SLOT_OF.get(p.position_override ?? p.position ?? "") }]));
  const teamOf = new Map(teams.map((t) => [t.team_id, { school: t.teams.school, classification: t.classification }]));
  const pickedBy = new Map<number, Set<number>>();
  for (const p of picks) pickedBy.set(p.player_id, (pickedBy.get(p.player_id) ?? new Set()).add(p.entry_id));

  const games: ScoredGame[] = [];
  for (const s of stats) {
    const player = playerOf.get(s.player_id);
    const team = teamOf.get(s.team_id);
    if (!s.appeared || !player?.slot || !team || (team.classification !== "fbs" && team.classification !== "fcs")) continue;
    const opponentId = s.games.home_team_id === s.team_id ? s.games.away_team_id : s.games.home_team_id;
    games.push({
      playerId: s.player_id,
      name: player.name,
      slot: player.slot,
      division: team.classification as Division,
      school: team.school,
      week: s.games.week,
      opponent: teamOf.get(opponentId)?.school ?? "",
      points: scoreStatLine(
        {
          passYds: s.pass_yds,
          rushYds: s.rush_yds,
          recYds: s.rec_yds,
          passTd: s.pass_td,
          rushTd: s.rush_td,
          recTd: s.rec_td,
          interceptions: s.interceptions,
          fumblesLost: s.fumbles_lost,
        },
        rules,
      ),
    });
  }

  const counts = new Map([...pickedBy].map(([id, entries]) => [id, entries.size]));
  return {
    ...playerLeaders(games, counts),
    year,
    lastWeek,
    throughWeek: games.length ? Math.max(...games.map((g) => g.week)) : null,
  };
}
