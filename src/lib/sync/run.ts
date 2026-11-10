import "server-only";
import { newUsage } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { syncGames, syncLines, syncResults, syncRosters, syncTeams, type SyncContext, type SyncSummary } from "./cfbd-sync";

/** Whole-season reference syncs, in dependency order ("Sync everything" runs these). */
export const SYNC_KINDS = ["teams", "games", "rosters", "lines"] as const;
/** Every sync, including the per-week results sync. */
export const ALL_SYNC_KINDS = [...SYNC_KINDS, "results"] as const;
export type SyncKind = (typeof ALL_SYNC_KINDS)[number];

const SYNCS: Record<SyncKind, (ctx: SyncContext) => Promise<SyncSummary>> = {
  teams: syncTeams,
  games: syncGames,
  rosters: syncRosters,
  lines: syncLines,
  results: syncResults,
};

export type SyncResult =
  | { ok: true; kind: SyncKind; summary: SyncSummary; calls: number; remaining: number | null }
  | { ok: false; kind: SyncKind; error: string; calls: number; remaining: number | null };

/**
 * Runs one sync and records it in sync_runs (start, finish, CFBD calls used, quota left).
 * `week` is required for "results" and ignored otherwise. Never throws: failures come back
 * as `{ ok: false }` and are logged on the run row.
 */
export async function runSync(kind: SyncKind, year: number, week?: number): Promise<SyncResult> {
  const db = createAdminClient();
  const usage = newUsage();
  const runWeek = kind === "results" ? week : undefined;

  const season = must(
    await db.from("seasons").upsert({ year }, { onConflict: "year" }).select("id").single(),
    "ensure season",
  );
  const run = must(
    await db.from("sync_runs").insert({ kind, season_year: year, week: runWeek ?? null }).select("id").single(),
    "start sync run",
  );

  try {
    const summary = await SYNCS[kind]({ db, year, seasonId: season.id, usage, week: runWeek });
    await db
      .from("sync_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        cfbd_calls: usage.calls,
        cfbd_calls_remaining: usage.remaining,
        summary,
      })
      .eq("id", run.id);
    return { ok: true, kind, summary, calls: usage.calls, remaining: usage.remaining };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .from("sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        cfbd_calls: usage.calls,
        cfbd_calls_remaining: usage.remaining,
        error,
      })
      .eq("id", run.id);
    return { ok: false, kind, error, calls: usage.calls, remaining: usage.remaining };
  }
}
