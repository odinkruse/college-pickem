"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseStartSeason } from "@/lib/new-season";
import { currentSeasonYear } from "@/lib/season";
import { PLAYER_STATS_TAG } from "@/lib/stats/player-stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSync, SYNC_KINDS } from "@/lib/sync/run";
import { THEME_TAG } from "@/lib/theme/champion";
import type { FormState } from "../override-actions";

/**
 * Starts the next season from the /admin/season form: one database transaction (start_season), then
 * the site switches to it. Optionally loads the season's CFBD data afterwards (teams, games, rosters,
 * lines; ~5 calls) without making the admin wait.
 */
export async function startSeasonAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const db = createAdminClient();
    const parsed = parseStartSeason(form, await currentSeasonYear(db));
    if (!parsed.ok) return { ok: false, message: parsed.errors.join(" ") };
    const { payload } = parsed;

    const { data, error } = await db.rpc("start_season", { p: payload });
    if (error) return { ok: false, message: error.message.replace(/^start_season: /, "") };
    const result = data as { entries: number; new_members: { id: string; name: string }[] };

    const sync = form.get("sync") === "on";
    if (sync) {
      after(async () => {
        for (const kind of SYNC_KINDS) await runSync(kind, payload.year);
      });
    }

    updateTag(THEME_TAG);
    updateTag(PLAYER_STATS_TAG);
    revalidatePath("/", "layout");
    const fresh = result.new_members.length;
    return {
      ok: true,
      message:
        `${payload.year} started with ${result.entries} entries.` +
        (fresh ? ` ${fresh} new member${fresh === 1 ? "" : "s"}: their invite links are on the Members page.` : "") +
        (sync ? " Loading CFBD data in the background (a minute or two; see the admin overview)." : ""),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
