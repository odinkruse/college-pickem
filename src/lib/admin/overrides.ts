import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreWeek, type ScoreSummary } from "@/lib/picks/scoring";
import type { Database } from "@/lib/supabase/database.types";
import { must, ok } from "@/lib/supabase/helpers";
import type { ManualStats, NewPlayer, OverridePosition } from "./forms";

// Manual overrides. Everything written here has source = 'manual' (or provider 'manual' for lines),
// which the CFBD sync never overwrites. Stat changes rescore the game's week immediately.

type Db = SupabaseClient<Database>;

export const MANUAL_PROVIDER = "manual";

/** Sets (or, with null, removes) the hand-entered line. A manual line beats every CFBD provider. */
export async function setManualLine(db: Db, gameId: number, spreadHome: number | null): Promise<void> {
  if (spreadHome === null) {
    ok(await db.from("game_lines").delete().eq("game_id", gameId).eq("provider", MANUAL_PROVIDER), "remove manual line");
    return;
  }
  ok(
    await db.from("game_lines").upsert(
      { game_id: gameId, provider: MANUAL_PROVIDER, spread_home: spreadHome, source: "manual", fetched_at: new Date().toISOString() },
      { onConflict: "game_id,provider" },
    ),
    "save manual line",
  );
}

async function rescoreGameWeek(db: Db, gameId: number): Promise<ScoreSummary> {
  const game = must(await db.from("games").select("season_id, week").eq("id", gameId).single(), "load game");
  return scoreWeek(db, game.season_id, game.week);
}

/** The player's team in this game, from his roster row for the game's season. */
async function teamInGame(db: Db, playerId: number, gameId: number): Promise<number> {
  const game = must(await db.from("games").select("season_id, home_team_id, away_team_id").eq("id", gameId).single(), "load game");
  const ps = must(
    await db.from("player_seasons").select("team_id").eq("player_id", playerId).eq("season_id", game.season_id).maybeSingle(),
    "load player's team",
  );
  if (ps.team_id !== game.home_team_id && ps.team_id !== game.away_team_id) {
    throw new Error("That player's team isn't in this game.");
  }
  return ps.team_id;
}

/** Writes a hand-entered stat line (replacing any CFBD one) and rescores the week. */
export async function saveManualStats(db: Db, playerId: number, gameId: number, stats: ManualStats): Promise<ScoreSummary> {
  const teamId = await teamInGame(db, playerId, gameId);
  ok(
    await db
      .from("player_game_stats")
      .upsert({ player_id: playerId, game_id: gameId, team_id: teamId, ...stats, source: "manual" }, { onConflict: "player_id,game_id" }),
    "save stat line",
  );
  return rescoreGameWeek(db, gameId);
}

/**
 * Drops a hand-entered stat line and rescores. The CFBD line (if there is one) comes back on the
 * next results sync for that week; until then the player has no line, so a pick of him goes to review.
 */
export async function removeManualStats(db: Db, playerId: number, gameId: number): Promise<ScoreSummary> {
  ok(
    await db.from("player_game_stats").delete().eq("player_id", playerId).eq("game_id", gameId).eq("source", "manual"),
    "remove stat line",
  );
  return rescoreGameWeek(db, gameId);
}

/** null clears the override. Existing picks are not re-validated; the override affects new picks. */
export async function setPositionOverride(db: Db, playerId: number, seasonId: number, position: OverridePosition | null): Promise<void> {
  const { data, error } = await db
    .from("player_seasons")
    .update({ position_override: position })
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .select("player_id");
  if (error) throw new Error(`set position: ${error.message}`);
  if (!data?.length) throw new Error("That player has no roster row this season.");
}

/** Adds a player CFBD doesn't have. No cfbd_id, so the roster and results syncs never touch him. */
export async function addManualPlayer(db: Db, seasonId: number, p: NewPlayer): Promise<number> {
  const ts = await db.from("team_seasons").select("team_id").eq("team_id", p.teamId).eq("season_id", seasonId).maybeSingle();
  if (!ts.data) throw new Error("That team isn't in this season.");

  const player = must(await db.from("players").insert({ name: p.name, source: "manual" }).select("id").single(), "add player");
  const { error } = await db
    .from("player_seasons")
    .insert({ player_id: player.id, season_id: seasonId, team_id: p.teamId, position: p.position, jersey: p.jersey });
  if (error) {
    await db.from("players").delete().eq("id", player.id); // no transactions over the REST API; undo by hand
    throw new Error(`add player to roster: ${error.message}`);
  }
  return player.id;
}

export function describeScore(s: ScoreSummary): string {
  const base = s.picks === 0 ? "No picks affected." : `Rescored ${s.picks} pick${s.picks === 1 ? "" : "s"} (${s.changed} changed).`;
  return s.failed.length ? `${base} Problems: ${s.failed.join("; ")}` : base;
}
