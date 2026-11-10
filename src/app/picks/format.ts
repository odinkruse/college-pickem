import type { Slot, WeekRule } from "@/lib/rules";

export const SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };

export const RULE_LABEL: Record<WeekRule, string> = {
  standard: "Standard week",
  conference: "Conference week",
  underdog: "Underdog week",
};

export const RULE_HINT: Record<WeekRule, string> = {
  standard: "Any eligible QB, RB and WR/TE.",
  conference: "All three picks from one conference, each in a game between two teams from that conference.",
  underdog: "Only players whose team is not favored.",
};

/** Team's spread from its own side: "+3.5", "-7", "PK", or "No line". */
export function formatSpread(spread: number | null): string {
  if (spread === null) return "No line";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}
