import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { currentSeasonYear, leagueLastWeek } from "@/lib/season";
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
  /** "week": last week's top scorer. "season": a season's overall winner (offseason, and next season's week 1). */
  kind: "week" | "season";
  name: string;
  /** Week mode: the week they won. */
  week: number | null;
  /** The season the title is from. */
  season: number;
  /** Their score that week, or their season total. */
  points: number;
  team: { school: string; logoUrl: string | null } | null;
};

export type SiteTheme = {
  /** `:root{…}` overrides for globals.css, or "" for the default palette. */
  css: string;
  /** The week these colors are for, or null in the offseason. */
  week: number | null;
  palette: PaletteName;
  champion: Champion | null;
};

const DEFAULT_THEME: SiteTheme = { css: "", week: null, palette: "field", champion: null };

/**
 * The current theme. Cached for an hour (the champion only changes once a week); Server Actions that
 * import picks, sync results or change a favorite team call `updateTag(THEME_TAG)` to refresh it now.
 *
 * During the season: the last finished week's top scorer, for the next week. Once the league's last
 * week is final: the season champion, through the offseason and on into week 1 of the next season
 * as the defending champion (until a week of the new season is final).
 */
export async function getSiteTheme(): Promise<SiteTheme> {
  "use cache";
  cacheLife("hours");
  cacheTag(THEME_TAG);

  const db = createAdminClient();
  const year = await currentSeasonYear();
  const [{ rows, weeks }, unfinished, lastWeek] = await Promise.all([
    loadStandings(db, year),
    db.from("games").select("week, seasons!inner(year)").eq("seasons.year", year).eq("completed", false),
    leagueLastWeek(year, db),
  ]);
  const unfinishedWeeks = new Set(must(unfinished, "load unfinished games").map((g) => g.week));

  // The latest week that's over (every game final) and scored for most of the league, so a week
  // whose picks haven't been imported yet doesn't crown whoever happened to be entered first.
  const week = [...weeks]
    .reverse()
    .find((w) => w <= lastWeek && !unfinishedWeeks.has(w) && rows.filter((r) => r.byWeek.has(w)).length >= rows.length / 2);

  if (week !== undefined && week < lastWeek) {
    // Rows are sorted by season total, so the first row with the top score wins ties.
    const best = Math.max(...rows.map((r) => r.byWeek.get(week) ?? -Infinity));
    const top = rows.find((r) => r.byWeek.get(week) === best)!;
    return themeFor(db, top.profileId, year, week + 1, { kind: "week", name: top.name, week, season: year, points: best });
  }

  // Season over, or the new one hasn't finished a week yet: the (defending) season champion.
  const seasonYear = week === undefined ? year - 1 : year;
  const champion = (week === undefined ? (await loadStandings(db, seasonYear)).rows : rows)[0];
  if (!champion) return DEFAULT_THEME;
  return themeFor(db, champion.profileId, year, week === undefined ? (weeks[0] ?? 1) : null, {
    kind: "season",
    name: champion.name,
    week: null,
    season: seasonYear,
    points: champion.total,
  });
}

/** The champion's team colors on the palette for `forWeek`'s rule (none in the offseason). */
async function themeFor(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  year: number,
  forWeek: number | null,
  champion: Omit<Champion, "team">,
): Promise<SiteTheme> {
  const [profile, rule] = await Promise.all([
    db.from("profiles").select("teams(school, logo_url, color, alt_color)").eq("id", profileId).maybeSingle(),
    forWeek === null
      ? Promise.resolve({ data: null, error: null })
      : db
          .from("league_weeks")
          .select("rule, leagues!inner(slug), seasons!inner(year)")
          .eq("leagues.slug", LEAGUE_SLUG)
          .eq("seasons.year", year)
          .eq("week", forWeek)
          .maybeSingle(),
  ]);
  if (profile.error) throw new Error(`load champion's team: ${profile.error.message}`);
  if (rule.error) throw new Error(`load week rule: ${rule.error.message}`);
  const team = profile.data?.teams ?? null; // no favorite team picked yet
  const palette = SPECIAL_WEEK_PALETTE[rule.data?.rule ?? ""] ?? "field"; // no row = a standard week
  const vars = team ? teamPalette(team.color, team.alt_color, palette) : PALETTES[palette];

  return {
    css: themeCss(vars),
    week: forWeek,
    palette,
    champion: { ...champion, team: team ? { school: team.school, logoUrl: team.logo_url } : null },
  };
}
