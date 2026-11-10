import { describe, expect, it } from "vitest";
import type { CfbdBoxScore } from "@/lib/cfbd";
import { parseBoxScores } from "./box-score";

// Shaped like a real CFBD /games/players response (strings everywhere, team rows with negative ids).
const box: CfbdBoxScore = {
  id: 401,
  teams: [
    {
      team: "Home U",
      homeAway: "home",
      categories: [
        {
          name: "passing",
          types: [
            { name: "C/ATT", athletes: [{ id: "10", name: "Qb One", stat: "21/30" }] },
            { name: "YDS", athletes: [{ id: "10", name: "Qb One", stat: "287" }, { id: "-99", name: " Team", stat: "287" }] },
            { name: "TD", athletes: [{ id: "10", name: "Qb One", stat: "3" }] },
            { name: "INT", athletes: [{ id: "10", name: "Qb One", stat: "1" }] },
          ],
        },
        {
          name: "rushing",
          types: [
            { name: "CAR", athletes: [{ id: "10", name: "Qb One", stat: "6" }, { id: "20", name: "Rb Two", stat: "18" }] },
            { name: "YDS", athletes: [{ id: "10", name: "Qb One", stat: "-4" }, { id: "20", name: "Rb Two", stat: "112" }] },
            { name: "TD", athletes: [{ id: "10", name: "Qb One", stat: "0" }, { id: "20", name: "Rb Two", stat: "1" }] },
          ],
        },
        {
          name: "receiving",
          types: [
            { name: "REC", athletes: [{ id: "30", name: "Wr Three", stat: "0" }] },
            { name: "YDS", athletes: [{ id: "30", name: "Wr Three", stat: "0" }] },
            { name: "TD", athletes: [{ id: "30", name: "Wr Three", stat: "0" }] },
          ],
        },
        {
          name: "fumbles",
          types: [
            { name: "FUM", athletes: [{ id: "20", name: "Rb Two", stat: "1" }] },
            { name: "LOST", athletes: [{ id: "20", name: "Rb Two", stat: "1" }, { id: "70", name: "Lb Seven", stat: "0" }] },
          ],
        },
        {
          name: "kickReturns",
          types: [{ name: "TD", athletes: [{ id: "40", name: "Kr Four", stat: "1" }] }],
        },
      ],
    },
  ],
};

describe("parseBoxScores", () => {
  const lines = parseBoxScores([box]);
  const byId = new Map(lines.map((l) => [l.cfbdPlayerId, l]));

  it("collects passing, rushing and turnovers for a QB, including negative rushing", () => {
    expect(byId.get(10)?.stats).toEqual({
      pass_yds: 287,
      pass_td: 3,
      interceptions: 1,
      rush_yds: -4,
      rush_td: 0,
      rec_yds: 0,
      rec_td: 0,
      fumbles_lost: 0,
    });
    expect(byId.get(10)?.side).toBe("home");
  });

  it("merges a lost fumble into the runner's line", () => {
    expect(byId.get(20)?.stats).toMatchObject({ rush_yds: 112, rush_td: 1, fumbles_lost: 1 });
  });

  it("keeps a 0-catch receiver: he appeared in the box score, so he played", () => {
    expect(byId.get(30)?.stats).toMatchObject({ rec_yds: 0, rec_td: 0 });
  });

  it("skips team-total rows, return-only players, and fumble rows with nothing lost", () => {
    expect(byId.has(-99)).toBe(false);
    expect(byId.has(40)).toBe(false); // kick-return TDs don't count and don't make a line
    expect(byId.has(70)).toBe(false);
    expect(lines).toHaveLength(3);
  });
});
