import "server-only";
import { findCurrentWeek, getCalendar, seasonYearFor } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;
const LEAGUE_SLUG = "main";
const DEFAULT_LAST_WEEK = 14;

/**
 * The season the site is on: the latest one an admin has started (/admin/season), so a finished
 * season stays up through the offseason until the next is set up. Falls back to the calendar only
 * when no season has been started at all.
 */
export async function currentSeasonYear(db: Db = createAdminClient()): Promise<number> {
  const { data } = await db
    .from("league_seasons")
    .select("seasons!inner(year), leagues!inner(slug)")
    .eq("leagues.slug", LEAGUE_SLUG)
    .not("started_at", "is", null)
    .order("seasons(year)", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.seasons.year ?? seasonYearFor(new Date());
}

/** Every season the league has started, newest first (for past-season views). */
export async function startedSeasonYears(db: Db = createAdminClient()): Promise<number[]> {
  const { data } = await db
    .from("league_seasons")
    .select("seasons!inner(year), leagues!inner(slug)")
    .eq("leagues.slug", LEAGUE_SLUG)
    .not("started_at", "is", null);
  return (data ?? []).map((r) => r.seasons.year).sort((a, b) => b - a);
}

/** The league's last week for a season (league_seasons.last_week; 14 when unset). Later CFBD weeks aren't played. */
export async function leagueLastWeek(year: number, db: Db = createAdminClient()): Promise<number> {
  const { data } = await db
    .from("league_seasons")
    .select("last_week, leagues!inner(slug), seasons!inner(year)")
    .eq("leagues.slug", LEAGUE_SLUG)
    .eq("seasons.year", year)
    .maybeSingle();
  return data?.last_week ?? DEFAULT_LAST_WEEK;
}

/**
 * The league's week numbers (CFBD's regular-season calendar, up to the league's last week) and the
 * current one. Falls back to 1–last week if the calendar can't be loaded.
 */
export async function seasonWeeks(year: number, now: Date): Promise<{ weeks: number[]; current: number }> {
  const lastWeek = await leagueLastWeek(year);
  try {
    const calendar = (await getCalendar(year)).filter((w) => w.seasonType === "regular" && w.week <= lastWeek);
    const weeks = calendar.map((w) => w.week);
    const current = findCurrentWeek(calendar, now);
    return { weeks, current: current?.week ?? weeks.at(-1) ?? 1 };
  } catch {
    return { weeks: Array.from({ length: lastWeek }, (_, i) => i + 1), current: 1 };
  }
}
