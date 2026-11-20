import { describe, expect, it } from "vitest";
import { playerLeaders, type ScoredGame } from "./leaders";

const g = (playerId: number, name: string, slot: ScoredGame["slot"], division: ScoredGame["division"], week: number, points: number): ScoredGame => ({
  playerId,
  name,
  slot,
  division,
  school: division === "fbs" ? "Big State" : "Small State",
  week,
  opponent: "Rival",
  points,
});

const GAMES: ScoredGame[] = [
  g(1, "Alpha QB", "QB", "fbs", 1, 30),
  g(1, "Alpha QB", "QB", "fbs", 2, 20),
  g(2, "Bravo QB", "QB", "fcs", 1, 45),
  g(3, "Charlie QB", "QB", "fbs", 2, 25),
  g(4, "Delta RB", "RB", "fcs", 1, 18),
  g(5, "Echo WR", "WRTE", "fbs", 3, 12),
];

describe("playerLeaders", () => {
  const leaders = playerLeaders(GAMES, new Map([[1, 3]]), { overallCount: 2, divisionCount: 5 });

  it("ranks season totals across FBS and FCS", () => {
    expect(leaders.overall.QB.map((l) => [l.name, l.total, l.games])).toEqual([
      ["Alpha QB", 50, 2],
      ["Bravo QB", 45, 1],
    ]);
  });

  it("finds the best single game per position", () => {
    expect(leaders.bestGame.QB).toMatchObject({ name: "Bravo QB", points: 45, week: 1 });
    expect(leaders.bestGame.RB).toMatchObject({ name: "Delta RB", points: 18 });
  });

  it("splits by division", () => {
    expect(leaders.byDivision.QB.fbs.map((l) => l.name)).toEqual(["Alpha QB", "Charlie QB"]);
    expect(leaders.byDivision.QB.fcs.map((l) => l.name)).toEqual(["Bravo QB"]);
    expect(leaders.byDivision.RB.fbs).toEqual([]);
  });

  it("counts league picks", () => {
    expect(leaders.overall.QB[0].pickedBy).toBe(3);
    expect(leaders.overall.QB[1].pickedBy).toBe(0);
  });

  it("breaks ties by name", () => {
    const tied = playerLeaders([g(7, "Zed", "RB", "fbs", 1, 10), g(8, "Abe", "RB", "fbs", 1, 10)], new Map());
    expect(tied.overall.RB.map((l) => l.name)).toEqual(["Abe", "Zed"]);
  });
});
