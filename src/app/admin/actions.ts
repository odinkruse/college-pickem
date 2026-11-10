"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isAdminAuthorization } from "@/lib/admin-auth";
import { runSync, SYNC_KINDS, type SyncKind, type SyncResult } from "@/lib/sync/run";

export type SyncActionState = { ok: boolean; lines: string[] } | null;

/**
 * Runs one CFBD sync, or all of them in dependency order (teams → games → rosters → lines),
 * stopping at the first failure. Returns short human-readable lines, not raw rows.
 */
export async function syncAction(_prev: SyncActionState, formData: FormData): Promise<SyncActionState> {
  // Re-check here: proxy.ts guards the /admin URL, but an action can be POSTed to directly.
  if (!isAdminAuthorization((await headers()).get("authorization"))) {
    return { ok: false, lines: ["Not authorized."] };
  }

  const year = Number(formData.get("season"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, lines: ["Invalid season."] };
  }
  const kind = String(formData.get("kind"));
  const kinds: SyncKind[] =
    kind === "all" ? [...SYNC_KINDS] : (SYNC_KINDS as readonly string[]).includes(kind) ? [kind as SyncKind] : [];
  if (kinds.length === 0) return { ok: false, lines: [`Unknown sync "${kind}".`] };

  const results: SyncResult[] = [];
  for (const k of kinds) {
    const result = await runSync(k, year);
    results.push(result);
    if (!result.ok) break;
  }

  revalidatePath("/admin");
  return { ok: results.every((r) => r.ok), lines: results.map(describe) };
}

function describe(r: SyncResult): string {
  if (!r.ok) return `${r.kind}: failed — ${r.error}`;
  const counts = Object.entries(r.summary)
    .map(([key, value]) => `${value} ${key}`)
    .join(", ");
  return `${r.kind}: ${counts}`;
}
