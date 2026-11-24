"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { currentSeasonYear } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { THEME_TAG } from "@/lib/theme/champion";
import { changedWeeks, parseWeekSettings, type SpecialRule } from "@/lib/week-settings";
import type { FormState } from "../override-actions";

const LABEL: Record<SpecialRule | "standard", string> = {
  standard: "Standard",
  conference: "Conference",
  underdog: "Underdog",
  championship: "Championship",
};

/**
 * Saves the current season's special weeks and last week (set_week_settings, one transaction).
 * Changing a week that has already kicked off needs the "allow_started" box ticked, since it changes
 * how that week's picks are judged.
 */
export async function saveWeekSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const db = createAdminClient();
    const year = await currentSeasonYear(db);

    const errors: string[] = [];
    const settings = parseWeekSettings(form, errors);
    if (errors.length) return { ok: false, message: errors.join(" ") };

    const [current, summary] = await Promise.all([
      db.from("league_weeks").select("week, rule, leagues!inner(slug), seasons!inner(year)").eq("leagues.slug", "main").eq("seasons.year", year),
      db.rpc("week_summary", { p_year: year }),
    ]);
    if (current.error) throw new Error(current.error.message);
    if (summary.error) throw new Error(summary.error.message);
    const before = current.data.filter((w) => w.rule !== "standard").map((w) => ({ week: w.week, rule: w.rule as SpecialRule }));
    const changed = changedWeeks(before, settings.weeks);

    const started = changed.filter((w) => summary.data.some((s) => s.week === w && s.started > 0));
    if (started.length && form.get("allow_started") !== "on") {
      const list = started.map((w) => `week ${w}`).join(", ");
      return {
        ok: false,
        message: `Games have already kicked off in ${list}. Changing its type changes how those picks are judged; tick "Change weeks that have started" to go ahead.`,
      };
    }

    const { error } = await db.rpc("set_week_settings", { p: { year, ...settings } });
    if (error) {
      if (error.message.includes("picks_one_use_per_player")) {
        return {
          ok: false,
          message:
            "Someone re-picked a player they'd already used during Championship week, which only Championship week allows. Change that pick first, then try again.",
        };
      }
      return { ok: false, message: error.message.replace(/^set_week_settings: /, "") };
    }

    updateTag(THEME_TAG); // special weeks keep their own field colors
    revalidatePath("/", "layout");
    const ruleOf = (w: number) => settings.weeks.find((s) => s.week === w)?.rule ?? "standard";
    return {
      ok: true,
      message: changed.length
        ? `Saved. ${changed.map((w) => `Week ${w}: ${LABEL[ruleOf(w)]}`).join(" · ")}.`
        : "Saved. No week types changed.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
