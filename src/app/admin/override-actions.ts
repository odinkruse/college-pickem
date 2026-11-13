"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseManualSpread, parseManualStats, parseNewPlayer, parseOverride } from "@/lib/admin/forms";
import {
  addManualPlayer,
  describeScore,
  removeManualStats,
  saveManualStats,
  setManualLine,
  setPositionOverride,
} from "@/lib/admin/overrides";
import { createAdminClient } from "@/lib/supabase/admin";

// Server Actions for the manual-override forms. Each is used with useActionState, so it receives the
// previous state plus the submitted FormData and returns a message to show under the form.

export type FormState = { ok: boolean; message: string } | null;

async function guard() {
  await requireAdmin();
  return createAdminClient();
}

function id(form: FormData, key: string): number {
  const n = Number(form.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${key}.`);
  return n;
}

/** Runs the write, revalidates the pages that show its data, and turns throws into a message. */
async function run(write: () => Promise<string>): Promise<FormState> {
  try {
    const message = await write();
    revalidatePath("/admin", "layout");
    revalidatePath("/picks", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveLineAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const db = await guard();
    const gameId = id(form, "game");
    if (form.get("op") === "clear") {
      await setManualLine(db, gameId, null);
      return "Manual line removed; the CFBD line applies again.";
    }
    const spread = parseManualSpread(String(form.get("favorite") ?? ""), form.get("points"));
    if (!spread.ok) throw new Error(spread.error);
    await setManualLine(db, gameId, spread.value);
    return "Manual line saved.";
  });
}

export async function saveStatsAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const db = await guard();
    const playerId = id(form, "player");
    const gameId = id(form, "game");
    if (form.get("op") === "remove") {
      return `Manual stat line removed. ${describeScore(await removeManualStats(db, playerId, gameId))}`;
    }
    const stats = parseManualStats(form);
    if (!stats.ok) throw new Error(stats.error);
    return `Saved. ${describeScore(await saveManualStats(db, playerId, gameId, stats.value))}`;
  });
}

export async function setOverrideAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const db = await guard();
    const position = parseOverride(form.get("position"));
    if (!position.ok) throw new Error(position.error);
    await setPositionOverride(db, id(form, "player"), id(form, "season"), position.value);
    return position.value ? `Now a ${position.value}.` : "Override cleared.";
  });
}

export async function addPlayerAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const db = await guard();
    const player = parseNewPlayer(form);
    if (!player.ok) throw new Error(player.error);
    await addManualPlayer(db, id(form, "season"), player.value);
    return `Added ${player.value.name}.`;
  });
}
