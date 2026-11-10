"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isAdminAuthorization } from "@/lib/admin-auth";
import {
  loadWeekContext,
  removePick,
  savePick,
  searchCandidates,
  setWeekRule,
  type CandidateResult,
  type WriteResult,
} from "@/lib/picks/service";
import type { Slot, WeekRule } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/admin";

// Server Actions for the picks page. Each one re-checks the password (an action can be POSTed to
// directly, bypassing the /picks URL guard in proxy.ts) and validates its arguments, since anything
// arriving from the browser is untrusted.

const SLOTS: readonly Slot[] = ["QB", "RB", "WRTE"];
const RULES: readonly WeekRule[] = ["standard", "conference", "underdog"];

async function guard(year: number, week: number) {
  if (!isAdminAuthorization((await headers()).get("authorization"))) throw new Error("Not authorized");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid season");
  if (!Number.isInteger(week) || week < 0 || week > 20) throw new Error("Invalid week");
  return createAdminClient();
}

function assertSlot(slot: string): asserts slot is Slot {
  if (!SLOTS.includes(slot as Slot)) throw new Error("Invalid slot");
}

export async function searchPlayersAction(year: number, week: number, slot: Slot, query: string): Promise<CandidateResult[]> {
  const db = await guard(year, week);
  assertSlot(slot);
  const ctx = await loadWeekContext(db, year, week);
  return searchCandidates(db, ctx, slot, String(query).slice(0, 60), new Date());
}

export async function savePickAction(year: number, week: number, slot: Slot, playerId: number): Promise<WriteResult> {
  const db = await guard(year, week);
  assertSlot(slot);
  if (!Number.isInteger(playerId)) return { ok: false, errors: ["Invalid player"] };
  try {
    const ctx = await loadWeekContext(db, year, week);
    const result = await savePick(db, ctx, slot, playerId, new Date());
    if (result.ok) revalidatePath("/picks");
    return result;
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export async function removePickAction(year: number, week: number, slot: Slot): Promise<WriteResult> {
  const db = await guard(year, week);
  assertSlot(slot);
  const ctx = await loadWeekContext(db, year, week);
  const result = await removePick(db, ctx, slot);
  if (result.ok) revalidatePath("/picks");
  return result;
}

export async function setWeekRuleAction(year: number, week: number, rule: WeekRule): Promise<void> {
  const db = await guard(year, week);
  if (!RULES.includes(rule)) throw new Error("Invalid rule");
  const ctx = await loadWeekContext(db, year, week);
  await setWeekRule(db, ctx, rule);
  revalidatePath("/picks");
}
