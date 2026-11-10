// Mirrors the database function public.game_lock_at so the UI shows the same lock time the
// database enforces. Keep the two in sync.

const EASTERN = "America/New_York";

const easternParts = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
});

function partsInEastern(d: Date) {
  const p = Object.fromEntries(easternParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) };
}

/**
 * When picks on a game lock: kickoff, or noon Eastern on game day when the kickoff time is TBD
 * (CFBD stores TBD games at midnight Eastern).
 */
export function lockAt(kickoff: Date, startTimeTbd: boolean): Date {
  if (!startTimeTbd) return kickoff;
  const { year, month, day } = partsInEastern(kickoff);
  // Noon Eastern is 16:00 UTC during daylight time and 17:00 UTC otherwise.
  for (const utcHour of [16, 17]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour));
    if (partsInEastern(candidate).hour === 12) return candidate;
  }
  throw new Error(`Could not compute noon Eastern for ${kickoff.toISOString()}`);
}
