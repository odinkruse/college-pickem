"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { FormState } from "@/app/admin/override-actions";
import { requireMember } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok } from "@/lib/supabase/helpers";
import { loadTeamOptions } from "@/lib/teams";
import { THEME_TAG } from "@/lib/theme/champion";

/** The signed-in member sets (or clears) their own favorite team. */
export async function setMyTeamAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const viewer = await requireMember();
    const raw = String(form.get("team") ?? "");
    const options = await loadTeamOptions(seasonYearFor(new Date()));
    const team = raw ? options.find((t) => t.id === Number(raw)) : undefined;
    if (raw && !team) return { ok: false, message: "Pick a team from the list." };

    ok(await createAdminClient().from("profiles").update({ favorite_team_id: team?.id ?? null }).eq("id", viewer.profileId), "save favorite team");
    updateTag(THEME_TAG); // this member might be the current champion
    revalidatePath("/picks/team");
    return { ok: true, message: team ? `Saved: ${team.school}.` : "Cleared." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
