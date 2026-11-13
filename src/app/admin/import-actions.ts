"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isAdminAuthorization } from "@/lib/admin-auth";
import { matchCellText, runImport, saveImportOverride } from "@/lib/import/league-import";
import type { Slot } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "./override-actions";

// Server Actions for /admin/import. The full report of each import is stored in sync_runs, and the
// page renders the latest one, so these only return a one-line message.

const SLOTS: readonly Slot[] = ["QB", "RB", "WRTE"];

async function guard() {
  if (!isAdminAuthorization((await headers()).get("authorization"))) throw new Error("Not authorized.");
  return createAdminClient();
}

function yearOf(form: FormData) {
  const year = Number(form.get("season"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid season.");
  return year;
}

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/picks", "layout");
  revalidatePath("/standings", "layout");
}

export async function importAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const db = await guard();
    const year = yearOf(form);
    const weekText = String(form.get("week") ?? "all");
    const weeks = weekText === "all" ? undefined : [Number(weekText)];
    if (weeks && (!Number.isInteger(weeks[0]) || weeks[0] < 0 || weeks[0] > 20)) throw new Error("Invalid week.");
    const result = await runImport(db, year, weeks);
    refresh();
    if (!result.ok) return { ok: false, message: result.error };
    const s = result.summary;
    return {
      ok: true,
      message: `${s.matched}/${s.cells} cells matched · ${s.inserted} new, ${s.updated} changed, ${s.unchanged} unchanged · ${s.unresolved.length} unresolved.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Says how one sheet cell should be read: a suggested player, or typed "Name - School" matched for
 * that week. Saves an override for that exact cell text, then re-imports that week.
 */
export async function resolveCellAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const db = await guard();
    const year = yearOf(form);
    const week = Number(form.get("week"));
    const slot = String(form.get("slot")) as Slot;
    const member = String(form.get("member") ?? "");
    const text = String(form.get("text") ?? "");
    if (!Number.isInteger(week) || !SLOTS.includes(slot) || !member || !text) throw new Error("Invalid request.");

    let playerId = Number(form.get("player"));
    const typed = String(form.get("typed") ?? "").trim();
    if (typed) {
      const match = await matchCellText(db, year, week, slot, typed);
      if (!match.ok) throw new Error(`"${typed}": ${match.reason}`);
      playerId = match.playerId;
    }
    if (!Number.isInteger(playerId) || playerId <= 0) throw new Error("Choose a player or type one.");

    await saveImportOverride(db, { year, member, week, slot, text, playerId });
    const result = await runImport(db, year, [week]);
    refresh();
    return result.ok ? { ok: true, message: `Saved, and week ${week} re-imported.` } : { ok: false, message: result.error };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
