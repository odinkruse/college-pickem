import { describe, expect, it } from "vitest";
import { leagueWeeks } from "./weeks";

describe("leagueWeeks", () => {
  it("moves late-August week 1 games to week 0", () => {
    const weeks = leagueWeeks([
      { id: 1, week: 1, seasonType: "regular", startDate: "2026-08-27T23:00:00Z" },
      { id: 2, week: 1, seasonType: "regular", startDate: "2026-08-29T16:00:00Z" },
      { id: 3, week: 1, seasonType: "regular", startDate: "2026-09-03T23:00:00Z" },
      { id: 4, week: 1, seasonType: "regular", startDate: "2026-09-07T23:00:00Z" },
      { id: 5, week: 2, seasonType: "regular", startDate: "2026-09-12T16:00:00Z" },
    ]);
    expect([...weeks.values()]).toEqual([0, 0, 1, 1, 2]);
  });

  it("leaves a normal week 1 alone", () => {
    const weeks = leagueWeeks([
      { id: 1, week: 1, seasonType: "regular", startDate: "2026-09-03T23:00:00Z" },
      { id: 2, week: 1, seasonType: "regular", startDate: "2026-09-07T23:00:00Z" },
    ]);
    expect([...weeks.values()]).toEqual([1, 1]);
  });
});
