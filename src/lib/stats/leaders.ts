// Player stat leaders under the league's scoring: season totals and best single games, by pick slot
// and division. Pure, so the ranking rules are unit-tested; loading lives in player-stats.ts.

import type { Slot } from "@/lib/rules";

export type Division = "fbs" | "fcs";

/** One player's scored box-score line in one game. */
export type ScoredGame = {
  playerId: number;
  name: string;
  slot: Slot;
  division: Division;
  school: string;
  week: number;
  opponent: string;
  points: number;
};

export type SeasonLeader = {
  playerId: number;
  name: string;
  slot: Slot;
  division: Division;
  school: string;
  total: number;
  games: number;
  /** How many league entries picked him this season (any week). */
  pickedBy: number;
};

export type PlayerLeaders = {
  /** Top N season totals per slot, FBS and FCS together. */
  overall: Record<Slot, SeasonLeader[]>;
  /** The best single game per slot, FBS and FCS together. */
  bestGame: Record<Slot, ScoredGame | null>;
  /** Top N season totals per slot and division. */
  byDivision: Record<Slot, Record<Division, SeasonLeader[]>>;
};

const SLOTS: Slot[] = ["QB", "RB", "WRTE"];
const byPointsThenName = <T extends { name: string }>(points: (x: T) => number) => (a: T, b: T) =>
  points(b) - points(a) || a.name.localeCompare(b.name);

export function playerLeaders(
  games: ScoredGame[],
  pickedBy: Map<number, number>,
  { overallCount = 3, divisionCount = 5 }: { overallCount?: number; divisionCount?: number } = {},
): PlayerLeaders {
  const totals = new Map<number, SeasonLeader>();
  for (const g of games) {
    const t = totals.get(g.playerId);
    if (t) {
      t.total += g.points;
      t.games += 1;
      // A transfer mid-season keeps the first team seen; totals still add up across both.
    } else {
      totals.set(g.playerId, {
        playerId: g.playerId,
        name: g.name,
        slot: g.slot,
        division: g.division,
        school: g.school,
        total: g.points,
        games: 1,
        pickedBy: pickedBy.get(g.playerId) ?? 0,
      });
    }
  }
  const leaders = [...totals.values()].sort(byPointsThenName((x) => x.total));
  const gamesSorted = [...games].sort(byPointsThenName((x) => x.points));

  const pick = <T>(f: (slot: Slot) => T) => Object.fromEntries(SLOTS.map((s) => [s, f(s)])) as Record<Slot, T>;
  return {
    overall: pick((slot) => leaders.filter((l) => l.slot === slot).slice(0, overallCount)),
    bestGame: pick((slot) => gamesSorted.find((g) => g.slot === slot) ?? null),
    byDivision: pick((slot) => ({
      fbs: leaders.filter((l) => l.slot === slot && l.division === "fbs").slice(0, divisionCount),
      fcs: leaders.filter((l) => l.slot === slot && l.division === "fcs").slice(0, divisionCount),
    })),
  };
}
