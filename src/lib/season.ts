import "server-only";
import { findCurrentWeek, getCalendar } from "@/lib/cfbd";

/** Regular-season week numbers and the current one, from CFBD's cached calendar (falls back to 1–15). */
export async function seasonWeeks(year: number, now: Date): Promise<{ weeks: number[]; current: number }> {
  try {
    const calendar = await getCalendar(year);
    const weeks = calendar.filter((w) => w.seasonType === "regular").map((w) => w.week);
    const current = findCurrentWeek(calendar, now);
    const fallback = weeks.at(-1) ?? 1;
    return { weeks, current: current?.seasonType === "regular" ? current.week : fallback };
  } catch {
    return { weeks: Array.from({ length: 15 }, (_, i) => i + 1), current: 1 };
  }
}
