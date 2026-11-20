import "server-only";
import { seasonYearFor } from "@/lib/cfbd";
import { runImport } from "@/lib/import/league-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { leagueLastWeek } from "@/lib/season";
import { runSync } from "@/lib/sync/run";

// The automatic updates, triggered by Supabase pg_cron → /api/cron. Each run works out what's needed
// from the schedule in the database, so offseason runs cost nothing:
//   - results (4 CFBD calls/week): weeks with a game that kicked off in the last 36 hours
//   - lines (1 call): whenever a game is coming up in the next 10 days (the line at kickoff counts)
//   - games (2 calls, +2 once the FCS bracket exists; "daily" only): the whole season, to pick up
//     kickoff times, conference championship games and FCS playoff games as CFBD adds them
//   - league sheet import (no CFBD): the upcoming week and any week with games in the last 7 days
// Only weeks 1 through the league's last week (league_seasons.last_week) are considered.
// Budget at ~1 daily + 3 Saturday-evening runs: about 250–300 calls a month in season, of 1,000.

export const SCHEDULED_JOBS = ["daily", "gameday"] as const;
export type ScheduledJob = (typeof SCHEDULED_JOBS)[number];

const IMPORT_LOOKBACK_DAYS = 7;
const HOUR = 60 * 60 * 1000;

/** Never throws: each step is logged in sync_runs, and so is the run itself (kind "scheduled"). */
export async function runScheduled(job: ScheduledJob, now = new Date()): Promise<string[]> {
  const db = createAdminClient();
  const year = seasonYearFor(now);
  const steps: string[] = [];
  const run = (await db.from("sync_runs").insert({ kind: "scheduled", season_year: year, summary: { job } }).select("id").single()).data;

  try {
    const season = must(await db.from("seasons").select("id").eq("year", year).maybeSingle(), `load ${year} season`);
    const lastWeek = await leagueLastWeek(year, db);
    const games = must(
      await db
        .from("games")
        .select("week, kickoff_at")
        .eq("season_id", season.id)
        .gt("week", 0) // week 0 isn't part of the league
        .lte("week", lastWeek) // nor anything after its last week (Army–Navy, bowls)
        .gte("kickoff_at", new Date(now.getTime() - IMPORT_LOOKBACK_DAYS * 24 * HOUR).toISOString())
        .lte("kickoff_at", new Date(now.getTime() + 10 * 24 * HOUR).toISOString())
        .order("kickoff_at"),
      "load nearby games",
    );
    const started = games.filter((g) => Date.parse(g.kickoff_at) <= now.getTime());
    const recentWeeks = [...new Set(started.filter((g) => Date.parse(g.kickoff_at) >= now.getTime() - 36 * HOUR).map((g) => g.week))];
    // The sheet is sometimes filled in days after a week's games, so imports look back further.
    const lateWeeks = [...new Set(started.map((g) => g.week))];
    const upcomingWeek = games.find((g) => Date.parse(g.kickoff_at) > now.getTime())?.week;

    if (recentWeeks.length === 0 && upcomingWeek === undefined) {
      steps.push("No games in the last 36 hours or the next 10 days. Nothing to do.");
    }

    for (const week of recentWeeks) {
      const r = await runSync("results", year, week);
      steps.push(r.ok ? `week ${week} results synced (${r.calls} calls)` : `week ${week} results failed: ${r.error}`);
    }
    if (upcomingWeek !== undefined) {
      const lines = await runSync("lines", year);
      steps.push(lines.ok ? `lines synced (${lines.calls} call)` : `lines failed: ${lines.error}`);
      if (job === "daily") {
        // The whole season, same cost as one week: picks up kickoff times, games CFBD adds late
        // (conference championships) and the FCS playoff bracket.
        const g = await runSync("games", year);
        steps.push(g.ok ? `games refreshed (${g.calls} calls)` : `games failed: ${g.error}`);
      }
    }

    const importWeeks = [...new Set([...lateWeeks, ...(upcomingWeek === undefined ? [] : [upcomingWeek])])].sort((a, b) => a - b);
    const sheet = (await db.from("league_seasons").select("pick_sheet_id").eq("season_id", season.id).not("pick_sheet_id", "is", null).limit(1).maybeSingle()).data;
    if (importWeeks.length && sheet) {
      const imp = await runImport(db, year, importWeeks);
      steps.push(
        imp.ok
          ? `imported week ${importWeeks.join(", ")}: ${imp.summary.inserted} new, ${imp.summary.updated} changed, ${imp.summary.unresolved.length} unmatched`
          : `import failed: ${imp.error}`,
      );
    }

    const failed = steps.some((s) => s.includes("failed"));
    if (run) await db.from("sync_runs").update({ status: failed ? "error" : "ok", finished_at: new Date().toISOString(), summary: { job, steps }, error: failed ? steps.filter((s) => s.includes("failed")).join("; ") : null }).eq("id", run.id);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    steps.push(`failed: ${error}`);
    if (run) await db.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), summary: { job, steps }, error }).eq("id", run.id);
  }
  return steps;
}
