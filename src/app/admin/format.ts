// Display helpers shared by the admin pages.

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatKickoff = (iso: string, tbd: boolean) =>
  tbd ? `${timeFormat.format(new Date(iso)).replace(/,? \d+:\d+ [AP]M$/, "")} · TBD` : `${timeFormat.format(new Date(iso))} ET`;

/** A home-perspective spread as "Favorite −3.5", "Pick'em" or "No line". */
export function describeLine(spreadHome: number | null, home: string, away: string): string {
  if (spreadHome === null) return "No line";
  if (spreadHome === 0) return "Pick'em";
  return spreadHome < 0 ? `${home} −${-spreadHome}` : `${away} −${spreadHome}`;
}

/** Non-zero stats as a short readable list. */
export function describeStats(s: {
  pass_yds: number;
  pass_td: number;
  interceptions: number;
  rush_yds: number;
  rush_td: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
}): string {
  const parts: [number, string][] = [
    [s.pass_yds, "pass yds"],
    [s.pass_td, "pass TD"],
    [s.interceptions, "INT"],
    [s.rush_yds, "rush yds"],
    [s.rush_td, "rush TD"],
    [s.rec_yds, "rec yds"],
    [s.rec_td, "rec TD"],
    [s.fumbles_lost, "fum lost"],
  ];
  const shown = parts.filter(([n]) => n !== 0).map(([n, label]) => `${n} ${label}`);
  return shown.length ? shown.join(" · ") : "No stats";
}
