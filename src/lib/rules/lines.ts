export type LineRow = { provider: string; spreadHome: number | null; source: "cfbd" | "manual" };

/** Most-trusted first. The group checks lines on Score Mobile, which tends to track DraftKings. */
const PROVIDER_PRIORITY = ["DraftKings", "ESPN Bet", "Bovada", "consensus"];

/**
 * The single spread used for Underdog Week: a hand-entered line wins, then providers in
 * priority order, then any provider with a number.
 */
export function chooseSpread(lines: LineRow[]): number | null {
  const usable = lines.filter((l) => l.spreadHome !== null);
  const manual = usable.find((l) => l.source === "manual");
  if (manual) return manual.spreadHome;
  for (const provider of PROVIDER_PRIORITY) {
    const line = usable.find((l) => l.provider === provider);
    if (line) return line.spreadHome;
  }
  return usable[0]?.spreadHome ?? null;
}
