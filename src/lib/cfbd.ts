import "server-only";
import { cacheLife } from "next/cache";
import { requireEnv } from "@/lib/env";

const BASE_URL = "https://api.collegefootballdata.com";

export class CfbdError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CfbdError";
  }
}

/** Mutable tally a caller passes in to count calls and capture the quota left. */
export type CfbdUsage = { calls: number; remaining: number | null };

export const newUsage = (): CfbdUsage => ({ calls: 0, remaining: null });

/**
 * Low-level CFBD request. Every call counts against the monthly quota
 * (1,000 on the free tier), so callers should cache results or persist them
 * to the database rather than calling per page view.
 */
export async function cfbdFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  usage?: CfbdUsage,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${requireEnv("CFBD_API_KEY")}`,
      Accept: "application/json",
    },
  });
  if (usage) {
    usage.calls += 1;
    const remaining = res.headers.get("x-calllimit-remaining");
    if (remaining !== null) usage.remaining = Number(remaining);
  }
  if (!res.ok) {
    throw new CfbdError(res.status, `CFBD ${url.pathname} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields this app uses)
// ---------------------------------------------------------------------------

export type CfbdClassification = "fbs" | "fcs" | "ii" | "iii";

export type CalendarWeek = {
  season: number;
  week: number;
  seasonType: "regular" | "postseason" | string;
  startDate: string;
  endDate: string;
};

export type CfbdTeam = {
  id: number;
  school: string;
  mascot: string | null;
  abbreviation: string | null;
  conference: string | null;
  classification: CfbdClassification | null;
  logos: string[] | null;
};

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: "regular" | "postseason";
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeId: number;
  homeTeam: string;
  homeClassification: CfbdClassification | null;
  homeConference: string | null;
  homePoints: number | null;
  awayId: number;
  awayTeam: string;
  awayClassification: CfbdClassification | null;
  awayConference: string | null;
  awayPoints: number | null;
};

export type CfbdRosterPlayer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  team: string; // school name, not id
  jersey: number | null;
  position: string | null;
};

export type CfbdGameLines = {
  id: number; // CFBD game id
  lines: { provider: string; spread: number | null; spreadOpen: number | null }[];
};

/**
 * One game's box score. Stats are strings ("112", "-3", "12/20"). Athlete ids starting with "-"
 * are team-total rows. Categories include passing (YDS, TD, INT), rushing (YDS, TD),
 * receiving (YDS, TD), fumbles (FUM, LOST, REC), plus defense and special teams we ignore.
 */
export type CfbdBoxScore = {
  id: number; // CFBD game id
  teams: {
    team: string;
    homeAway: "home" | "away";
    categories: {
      name: string;
      types: { name: string; athletes: { id: string; name: string; stat: string }[] }[];
    }[];
  }[];
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Season calendar. Changes rarely, so it is cached for days (one CFBD call per season per day at most). */
export async function getCalendar(year: number): Promise<CalendarWeek[]> {
  "use cache";
  cacheLife("days");
  return cfbdFetch<CalendarWeek[]>("/calendar", { year });
}

/** All teams in every division (~680), with conference and classification for that season. */
export const fetchTeams = (year: number, usage?: CfbdUsage) =>
  cfbdFetch<CfbdTeam[]>("/teams", { year }, usage);

/** Regular-season games involving at least one team of the given classification (one week, or all). */
export const fetchGames = (year: number, classification: CfbdClassification, usage?: CfbdUsage, week?: number) =>
  cfbdFetch<CfbdGame[]>("/games", { year, week, classification, seasonType: "regular" }, usage);

/** Box-score player stats for one week, for games involving the given classification. */
export const fetchBoxScores = (year: number, week: number, classification: CfbdClassification, usage?: CfbdUsage) =>
  cfbdFetch<CfbdBoxScore[]>("/games/players", { year, week, classification, seasonType: "regular" }, usage);

/** Every roster in one call (~30k players, ~9 MB). */
export const fetchRosters = (year: number, usage?: CfbdUsage) =>
  cfbdFetch<CfbdRosterPlayer[]>("/roster", { year }, usage);

/** Betting lines for the whole regular season, FBS and FCS. Spread is from the home team's side. */
export const fetchLines = (year: number, usage?: CfbdUsage) =>
  cfbdFetch<CfbdGameLines[]>("/lines", { year, seasonType: "regular" }, usage);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** CFBD seasons are named by the year they start; January and February belong to the previous season. */
export function seasonYearFor(now: Date): number {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

/** The week in progress, or the next upcoming one. Falls back to the last week once the season is over. */
export function findCurrentWeek(calendar: CalendarWeek[], now: Date): CalendarWeek | null {
  const sorted = [...calendar].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sorted.find((w) => now < new Date(w.endDate)) ?? sorted.at(-1) ?? null;
}
