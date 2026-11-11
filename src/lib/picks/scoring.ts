import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCORING, lockAt, resolvePick, type PickStatus, type ScoringRules } from "@/lib/rules";
import type { Database, Json } from "@/lib/supabase/database.types";
import { must, ok } from "@/lib/supabase/helpers";

type Db = SupabaseClient<Database>;

/** seasons.scoring_rules, falling back to the defaults for any missing knob. */
export function parseRules(json: Json | null): ScoringRules {
  const r = json && typeof json === "object" && !Array.isArray(json) ? json : {};
  const num = (key: keyof ScoringRules) => (typeof r[key] === "number" ? (r[key] as number) : DEFAULT_SCORING[key]);
  return {
    passYdsPerPoint: num("passYdsPerPoint"),
    rushYdsPerPoint: num("rushYdsPerPoint"),
    recYdsPerPoint: num("recYdsPerPoint"),
    touchdown: num("touchdown"),
    turnover: num("turnover"),
  };
}

export type ScoreSummary = { picks: number; changed: number; final: number; dnp: number; needsReview: number; failed: string[] };

/**
 * Recomputes status, points and review flag for every pick (all entries) in one week, from the
 * stored games and stats. No CFBD calls; safe to run any time (after a stats sync, a manual
 * stat fix, or a scoring-rule change). Only rows whose result changed are written.
 */
export async function scoreWeek(db: Db, seasonId: number, week: number, now = new Date()): Promise<ScoreSummary> {
  const season = must(await db.from("seasons").select("scoring_rules").eq("id", seasonId).single(), "load season");
  const rules = parseRules(season.scoring_rules);

  const picks = must(
    await db
      .from("picks")
      .select("id, status, points, review_reason, player_id, game_id, entries!inner(season_id), games(kickoff_at, start_time_tbd, completed)")
      .eq("entries.season_id", seasonId)
      .eq("week", week),
    "load picks",
  );
  const summary: ScoreSummary = { picks: picks.length, changed: 0, final: 0, dnp: 0, needsReview: 0, failed: [] };
  if (picks.length === 0) return summary;

  const stats = must(
    await db
      .from("player_game_stats")
      .select("*")
      .in("game_id", [...new Set(picks.map((p) => p.game_id))])
      .in("player_id", [...new Set(picks.map((p) => p.player_id))]),
    "load stats",
  );
  const statFor = new Map(stats.map((s) => [`${s.player_id}|${s.game_id}`, s]));

  for (const p of picks) {
    const s = statFor.get(`${p.player_id}|${p.game_id}`);
    const result = resolvePick(
      {
        now,
        lockAt: lockAt(new Date(p.games.kickoff_at), p.games.start_time_tbd),
        gameCompleted: p.games.completed,
        stats: s
          ? {
              passYds: s.pass_yds,
              rushYds: s.rush_yds,
              recYds: s.rec_yds,
              passTd: s.pass_td,
              rushTd: s.rush_td,
              recTd: s.rec_td,
              interceptions: s.interceptions,
              fumblesLost: s.fumbles_lost,
              appeared: s.appeared,
            }
          : null,
      },
      rules,
    );

    if (result.status === "final") summary.final++;
    if (result.status === "dnp") summary.dnp++;
    if (result.reviewReason) summary.needsReview++;

    const unchanged =
      result.status === (p.status as PickStatus) && result.points === p.points && result.reviewReason === p.review_reason;
    if (unchanged) continue;

    const { error } = await db
      .from("picks")
      .update({ status: result.status, points: result.points, review_reason: result.reviewReason })
      .eq("id", p.id);
    if (error) {
      // e.g. a released (dnp) player was re-picked, then confirmed as having played: the
      // single-use index refuses. Surface it rather than hide it.
      summary.failed.push(`pick ${p.id}: ${error.code === "23505" ? "player already re-used in another week" : error.message}`);
    } else {
      summary.changed++;
    }
  }
  return summary;
}

/**
 * Settles a "no box-score line" review by recording a manual stats row for that player and game:
 * played = false releases him (DNP); played = true keeps him burned at 0 points. Then rescores the week.
 */
export async function resolveReview(db: Db, pickId: number, played: boolean): Promise<ScoreSummary> {
  const pick = must(
    await db.from("picks").select("player_id, game_id, team_id, week, entries(season_id)").eq("id", pickId).single(),
    "load pick",
  );
  ok(
    await db.from("player_game_stats").upsert(
      {
        player_id: pick.player_id,
        game_id: pick.game_id,
        team_id: pick.team_id,
        appeared: played,
        source: "manual",
        note: played ? "Confirmed played; no stats recorded" : "Confirmed did not play",
      },
      { onConflict: "player_id,game_id" },
    ),
    "record review decision",
  );
  return scoreWeek(db, pick.entries.season_id, pick.week);
}
