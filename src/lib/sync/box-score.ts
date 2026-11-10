import type { CfbdBoxScore } from "@/lib/cfbd";
import type { TablesInsert } from "@/lib/supabase/database.types";

// Pure parsing of CFBD box scores (no I/O), kept separate so it can be unit-tested.

export type StatFields = Pick<
  TablesInsert<"player_game_stats">,
  "pass_yds" | "rush_yds" | "rec_yds" | "pass_td" | "rush_td" | "rec_td" | "interceptions" | "fumbles_lost"
>;

/** Box-score "category.type" → our column. Anything else (defense, returns, kicking) is ignored. */
const STAT_COLUMNS: Record<string, keyof StatFields> = {
  "passing.YDS": "pass_yds",
  "passing.TD": "pass_td",
  "passing.INT": "interceptions",
  "rushing.YDS": "rush_yds",
  "rushing.TD": "rush_td",
  "receiving.YDS": "rec_yds",
  "receiving.TD": "rec_td",
  "fumbles.LOST": "fumbles_lost",
};

export type ParsedLine = { cfbdPlayerId: number; name: string; cfbdGameId: number; side: "home" | "away"; stats: StatFields };

/**
 * One line per player per game. A player gets a line if he appears in passing, rushing or
 * receiving (even with 0 yards: a 0-catch target still means he played), or lost a fumble.
 */
export function parseBoxScores(boxScores: CfbdBoxScore[]): ParsedLine[] {
  const lines = new Map<string, ParsedLine>();
  for (const game of boxScores) {
    for (const team of game.teams) {
      for (const category of team.categories) {
        for (const type of category.types) {
          const column = STAT_COLUMNS[`${category.name}.${type.name}`];
          if (!column) continue;
          for (const a of type.athletes) {
            if (!a.id || a.id.startsWith("-")) continue; // team-total rows
            const value = Number.parseInt(a.stat, 10) || 0;
            if (column === "fumbles_lost" && value === 0) continue;
            const key = `${a.id}|${game.id}`;
            const line =
              lines.get(key) ??
              lines
                .set(key, {
                  cfbdPlayerId: Number(a.id),
                  name: a.name,
                  cfbdGameId: game.id,
                  side: team.homeAway,
                  stats: { pass_yds: 0, rush_yds: 0, rec_yds: 0, pass_td: 0, rush_td: 0, rec_td: 0, interceptions: 0, fumbles_lost: 0 },
                })
                .get(key)!;
            line.stats[column] = value;
          }
        }
      }
    }
  }
  return [...lines.values()];
}
