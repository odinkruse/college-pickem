import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { seasonYearFor } from "@/lib/cfbd";
import { loadStandings } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { PALETTES, teamPalette, themeCss, type PaletteName } from "./palette";

// Champion's colors: the top scorer of the last finished week themes the site with their favorite
// team's colors for the following week. Conference week uses the night palette and Underdog week the
// arcade one, with the champion's colors as the highlights.

/** Cache tag for the site theme; Server Actions that change scores or favorite teams update it. */
export const THEME_TAG = "site-theme";

const LEAGUE_SLUG = "main";
const SPECIAL_WEEK_PALETTE: Record<string, PaletteName> = { conference: "night", underdog: "arcade" };

export type Champion = {
  name: string;
  /** The week they won, and their score that week. */
  week: number;
  points: number;
  team: { school: string; logoUrl: string | null } | null;
};

export type SiteTheme = {
  /** `:root{…}` overrides for globals.css, or "" for the default palette. */
  css: string;
  /** The week these colors are for (the week after the champion's), or null before any week is final. */
  week: number | null;
  palette: PaletteName;
  champion: Champion | null;
};

/**
 * The current theme. Cached for an hour (the champion only changes once a week); Server Actions that
 * import picks, sync results or change a favorite team call `updateTag(THEME_TAG)` to refresh it now.
 */
export async function getSiteTheme(): Promise<SiteTheme> {
  "use cache";
  cacheLife("hours");
  cacheTag(THEME_TAG);

  const db = createAdminClient();
  const year = seasonYearFor(new Date());
  const [{ rows, weeks }, unfinished] = await Promise.all([
    loadStandings(db, year),
    db.from("games").select("week, seasons!inner(year)").eq("seasons.year", year).eq("completed", false),
  ]);
  const unfinishedWeeks = new Set(must(unfinished, "load unfinished games").map((g) => g.week));

  // The latest week that's over (every game final) and scored for most of the league, so a week
  // whose picks haven't been imported yet doesn't crown whoever happened to be entered first.
  const week = [...weeks]
    .reverse()
    .find((w) => !unfinishedWeeks.has(w) && rows.filter((r) => r.byWeek.has(w)).length >= rows.length / 2);
  if (week === undefined) return { css: "", week: null, palette: "field", champion: null };

  // Rows are sorted by season total, so the first row with the top score wins ties.
  const best = Math.max(...rows.map((r) => r.byWeek.get(week) ?? -Infinity));
  const top = rows.find((r) => r.byWeek.get(week) === best)!;

  const [profile, rule] = await Promise.all([
    db.from("profiles").select("teams(school, logo_url, color, alt_color)").eq("id", top.profileId).maybeSingle(),
    db
      .from("league_weeks")
      .select("rule, leagues!inner(slug), seasons!inner(year)")
      .eq("leagues.slug", LEAGUE_SLUG)
      .eq("seasons.year", year)
      .eq("week", week + 1)
      .maybeSingle(),
  ]);
  if (profile.error) throw new Error(`load champion's team: ${profile.error.message}`);
  if (rule.error) throw new Error(`load week rule: ${rule.error.message}`);
  const team = profile.data?.teams ?? null; // no favorite team picked yet
  const palette = SPECIAL_WEEK_PALETTE[rule.data?.rule ?? ""] ?? "field"; // no row = a standard week
  const vars = team ? teamPalette(team.color, team.alt_color, palette) : PALETTES[palette];

  return {
    css: themeCss(vars),
    week: week + 1,
    palette,
    champion: { name: top.name, week, points: best, team: team ? { school: team.school, logoUrl: team.logo_url } : null },
  };
}
