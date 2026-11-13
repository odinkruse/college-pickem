"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { resolveReview } from "@/lib/picks/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScheduled } from "@/lib/scheduled";
import { runSync, SYNC_KINDS, type SyncKind, type SyncResult } from "@/lib/sync/run";

export type SyncActionState = { ok: boolean; lines: string[] } | null;

// Re-check in every action: the admin layout guards the pages, but an action can be POSTed to directly.
async function isAdmin() {
  return (await getViewer())?.isAdmin ?? false;
}

/**
 * Runs one CFBD sync, all season syncs in dependency order (teams → games → rosters → lines),
 * or the results sync for one week. Stops at the first failure. Returns short readable lines.
 */
export async function syncAction(_prev: SyncActionState, formData: FormData): Promise<SyncActionState> {
  if (!(await isAdmin())) return { ok: false, lines: ["Not authorized."] };

  const year = Number(formData.get("season"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, lines: ["Invalid season."] };
  }
  const kind = String(formData.get("kind"));
  const week = Number(formData.get("week"));

  let kinds: SyncKind[];
  if (kind === "all") kinds = [...SYNC_KINDS];
  else if (kind === "results") kinds = ["results"];
  else if ((SYNC_KINDS as readonly string[]).includes(kind)) kinds = [kind as SyncKind];
  else return { ok: false, lines: [`Unknown sync "${kind}".`] };

  if (kind === "results" && (!Number.isInteger(week) || week < 0 || week > 20)) {
    return { ok: false, lines: ["Pick a week for the results sync."] };
  }

  const results: SyncResult[] = [];
  for (const k of kinds) {
    const result = await runSync(k, year, k === "results" ? week : undefined);
    results.push(result);
    if (!result.ok) break;
  }

  revalidatePath("/admin");
  revalidatePath("/picks", "layout");
  return { ok: results.every((r) => r.ok), lines: results.map((r) => describe(r, week)) };
}

function describe(r: SyncResult, week: number): string {
  const label = r.kind === "results" ? `week ${week} results` : r.kind;
  if (!r.ok) return `${label}: failed — ${r.error}`;
  const counts = Object.entries(r.summary)
    .map(([key, value]) => `${value} ${key}`)
    .join(", ");
  return `${label}: ${counts}`;
}

/** Settles a "no box-score line" review: played = false releases the player, true keeps him burned. */
export async function resolveReviewAction(pickId: number, played: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorized." };
  if (!Number.isInteger(pickId) || typeof played !== "boolean") return { ok: false, error: "Invalid request." };
  try {
    const summary = await resolveReview(createAdminClient(), pickId, played);
    revalidatePath("/admin");
    revalidatePath("/picks", "layout");
    return summary.failed.length ? { ok: false, error: summary.failed.join("; ") } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs the scheduled "daily" job now (the same thing pg_cron triggers each morning). */
export async function runScheduledAction(): Promise<{ ok: boolean; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "Not authorized." };
  const steps = await runScheduled("daily");
  revalidatePath("/admin", "layout");
  return { ok: !steps.some((s) => s.includes("failed")), message: steps.join(" · ") };
}
