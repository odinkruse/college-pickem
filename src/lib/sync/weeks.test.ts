import { describe, expect, it } from "vitest";
import { leagueWeeks, postseasonWeek } from "./weeks";

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

describe("postseasonWeek", () => {
  const calendar = [
    { week: 13, seasonType: "regular", startDate: "2026-11-24T05:00:00Z", endDate: "2026-12-01T04:59:00Z" },
    { week: 14, seasonType: "regular", startDate: "2026-12-01T05:00:00Z", endDate: "2026-12-08T04:59:00Z" },
    { week: 1, seasonType: "postseason", startDate: "2026-12-08T05:00:00Z", endDate: "2027-01-20T04:59:00Z" },
  ];
  it("puts FCS playoff rounds in the league week they're played", () => {
    expect(postseasonWeek("2026-11-28T18:00:00Z", calendar)).toBe(13);
    expect(postseasonWeek("2026-12-05T18:00:00Z", calendar)).toBe(14);
  });
  it("drops games after the regular season", () => {
    expect(postseasonWeek("2026-12-12T18:00:00Z", calendar)).toBeNull();
  });
});
