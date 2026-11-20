// CFBD files the late-August "week 0" games under week 1, so a team can have two games in one CFBD
// week. The league's week 1 is the Labor Day weekend slate; the earlier games are week 0, which the
// league doesn't play. Pure, so the rule is unit-tested.

const DAY = 24 * 60 * 60 * 1000;

export type WeekGame = { id: number; week: number; seasonType: string; startDate: string };
export type CalendarRange = { week: number; seasonType: string; startDate: string; endDate: string };

/**
 * The week to store for each game: CFBD's, except regular-season week 1 games kicking off more than
 * 6 days before the last week 1 kickoff in `games`, which become week 0.
 * Pass every week 1 game CFBD returned (a whole-season or a week 1 fetch both do).
 */
export function leagueWeeks(games: WeekGame[]): Map<number, number> {
  const week1 = games.filter((g) => g.seasonType === "regular" && g.week === 1).map((g) => Date.parse(g.startDate));
  const cutoff = week1.length ? Math.max(...week1) - 6 * DAY : -Infinity;
  return new Map(
    games.map((g) => [g.id, g.seasonType === "regular" && g.week === 1 && Date.parse(g.startDate) < cutoff ? 0 : g.week]),
  );
}

/**
 * League week for a postseason game (the FCS playoffs): the regular-season calendar week whose dates
 * contain its kickoff, or null when it falls after the regular season (later playoff rounds, bowls),
 * which the league doesn't play. CFBD numbers postseason weeks separately, so dates are what line up.
 */
export function postseasonWeek(startDate: string, calendar: CalendarRange[]): number | null {
  const t = Date.parse(startDate);
  const week = calendar.find((w) => w.seasonType === "regular" && Date.parse(w.startDate) <= t && t < Date.parse(w.endDate));
  return week?.week ?? null;
}
