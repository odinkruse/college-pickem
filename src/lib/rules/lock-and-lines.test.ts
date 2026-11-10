import { describe, expect, it } from "vitest";
import { chooseSpread } from "./lines";
import { lockAt } from "./lock";

describe("lockAt", () => {
  it("is the kickoff when the time is known", () => {
    const kickoff = new Date("2026-11-14T20:30:00Z");
    expect(lockAt(kickoff, false)).toEqual(kickoff);
  });

  it("TBD games lock at noon Eastern on game day (standard time)", () => {
    // CFBD stores TBD games at midnight Eastern: 05:00Z in November. Same case the DB test checks.
    expect(lockAt(new Date("2026-11-28T05:00:00Z"), true).toISOString()).toBe("2026-11-28T17:00:00.000Z");
  });

  it("TBD games lock at noon Eastern on game day (daylight time)", () => {
    expect(lockAt(new Date("2026-09-19T04:00:00Z"), true).toISOString()).toBe("2026-09-19T16:00:00.000Z");
  });
});

describe("chooseSpread", () => {
  it("prefers a hand-entered line", () => {
    expect(
      chooseSpread([
        { provider: "DraftKings", spreadHome: -7, source: "cfbd" },
        { provider: "manual", spreadHome: -6.5, source: "manual" },
      ]),
    ).toBe(-6.5);
  });

  it("then DraftKings over other books", () => {
    expect(
      chooseSpread([
        { provider: "Bovada", spreadHome: -3, source: "cfbd" },
        { provider: "DraftKings", spreadHome: -3.5, source: "cfbd" },
      ]),
    ).toBe(-3.5);
  });

  it("falls back to any provider with a number, or null", () => {
    expect(chooseSpread([{ provider: "SomeBook", spreadHome: 2, source: "cfbd" }])).toBe(2);
    expect(chooseSpread([{ provider: "DraftKings", spreadHome: null, source: "cfbd" }])).toBeNull();
    expect(chooseSpread([])).toBeNull();
  });
});
