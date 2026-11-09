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

/**
 * Low-level CFBD request. Every call counts against the monthly quota
 * (1,000 on the free tier), so callers should cache results or persist them
 * to the database rather than calling per page view.
 */
export async function cfbdFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
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
  if (!res.ok) {
    throw new CfbdError(res.status, `CFBD ${url.pathname} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export type CalendarWeek = {
  season: number;
  week: number;
  seasonType: "regular" | "postseason" | string;
  startDate: string;
  endDate: string;
};

/** Season calendar. Changes rarely, so it is cached for days (one CFBD call per season per day at most). */
export async function getCalendar(year: number): Promise<CalendarWeek[]> {
  "use cache";
  cacheLife("days");
  return cfbdFetch<CalendarWeek[]>("/calendar", { year });
}

/** CFBD seasons are named by the year they start; January and February belong to the previous season. */
export function seasonYearFor(now: Date): number {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

/** The week in progress, or the next upcoming one. Falls back to the last week once the season is over. */
export function findCurrentWeek(calendar: CalendarWeek[], now: Date): CalendarWeek | null {
  const sorted = [...calendar].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sorted.find((w) => now < new Date(w.endDate)) ?? sorted.at(-1) ?? null;
}
