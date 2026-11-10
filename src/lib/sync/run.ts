import "server-only";
import { newUsage } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGames, syncLines, syncRosters, syncTeams, type SyncContext, type SyncSummary } from "./cfbd-sync";
import { must } from "./db-helpers";

export const SYNC_KINDS = ["teams", "games", "rosters", "lines"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

const SYNCS: Record<SyncKind, (ctx: SyncContext) => Promise<SyncSummary>> = {
  teams: syncTeams,
  games: syncGames,
  rosters: syncRosters,
  lines: syncLines,
};

export type SyncResult =
  | { ok: true; kind: SyncKind; summary: SyncSummary; calls: number; remaining: number | null }
  | { ok: false; kind: SyncKind; error: string; calls: number; remaining: number | null };

/**
 * Runs one sync and records it in sync_runs (start, finish, CFBD calls used, quota left).
 * Never throws: failures come back as `{ ok: false }` and are logged on the run row.
 */
export async function runSync(kind: SyncKind, year: number): Promise<SyncResult> {
  const db = createAdminClient();
  const usage = newUsage();

  const season = must(
    await db.from("seasons").upsert({ year }, { onConflict: "year" }).select("id").single(),
    "ensure season",
  );
  const run = must(
    await db.from("sync_runs").insert({ kind, season_year: year }).select("id").single(),
    "start sync run",
  );

  try {
    const summary = await SYNCS[kind]({ db, year, seasonId: season.id, usage });
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
