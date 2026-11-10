import { describe, expect, it } from "vitest";
import { NO_STATS_REVIEW, resolvePick, scoreBreakdown, scoreStatLine } from "./scoring";
import type { StatLine } from "./types";

const line = (s: Partial<StatLine>): StatLine => ({
  passYds: 0,
  rushYds: 0,
  recYds: 0,
  passTd: 0,
  rushTd: 0,
  recTd: 0,
  interceptions: 0,
  fumblesLost: 0,
  ...s,
});

describe("yardage", () => {
  it("1 point per 25 passing yards, whole increments only", () => {
    expect(scoreStatLine(line({ passYds: 24 }))).toBe(0);
    expect(scoreStatLine(line({ passYds: 25 }))).toBe(1);
    expect(scoreStatLine(line({ passYds: 249 }))).toBe(9);
    expect(scoreStatLine(line({ passYds: 250 }))).toBe(10);
  });

  it("1 point per 10 rushing or receiving yards: 19 yards is 1 point", () => {
    expect(scoreStatLine(line({ rushYds: 19 }))).toBe(1);
    expect(scoreStatLine(line({ recYds: 19 }))).toBe(1);
    expect(scoreStatLine(line({ recYds: 120 }))).toBe(12);
  });

  it("never combines categories: 15 rushing + 15 receiving is 2, not 3", () => {
    expect(scoreStatLine(line({ rushYds: 15, recYds: 15 }))).toBe(2);
  });

  it("negative yards count against, truncated toward zero: −7 is 0, −12 is −1", () => {
    expect(scoreStatLine(line({ rushYds: -7 }))).toBe(0);
    expect(scoreStatLine(line({ rushYds: -12 }))).toBe(-1);
    expect(scoreStatLine(line({ rushYds: -20 }))).toBe(-2);
    expect(Object.is(scoreBreakdown(line({ rushYds: -7 })).rushing, 0)).toBe(true); // not −0
  });
});

describe("touchdowns and turnovers", () => {
  it("6 points per passing, rushing and receiving TD", () => {
    expect(scoreStatLine(line({ passTd: 3 }))).toBe(18);
    expect(scoreStatLine(line({ rushTd: 1, recTd: 1 }))).toBe(12);
  });

  it("−2 per interception thrown and per fumble lost", () => {
    expect(scoreStatLine(line({ interceptions: 2 }))).toBe(-4);
    expect(scoreStatLine(line({ fumblesLost: 1 }))).toBe(-2);
  });

  it("scores a full QB line", () => {
    // 287 pass (11) + 41 rush (4) + 3 pass TD (18) + 1 rush TD (6) − 1 INT (−2) − 1 fumble lost (−2)
    const qb = line({ passYds: 287, rushYds: 41, passTd: 3, rushTd: 1, interceptions: 1, fumblesLost: 1 });
    expect(scoreBreakdown(qb)).toEqual({
      passing: 11,
      rushing: 4,
      receiving: 0,
      touchdowns: 24,
      turnovers: -4,
      total: 35,
    });
  });

  it("uses the season's scoring rules when given", () => {
    const halfPpr = { passYdsPerPoint: 20, rushYdsPerPoint: 10, recYdsPerPoint: 10, touchdown: 4, turnover: -1 };
    expect(scoreStatLine(line({ passYds: 40, passTd: 1, interceptions: 1 }), halfPpr)).toBe(2 + 4 - 1);
  });
});

describe("resolvePick", () => {
  const lockAt = new Date("2026-11-14T17:00:00Z");
  const before = new Date("2026-11-14T16:00:00Z");
  const after = new Date("2026-11-14T18:00:00Z");

  it("is pending before kickoff and locked after, until the game is final", () => {
    expect(resolvePick({ now: before, lockAt, gameCompleted: false, stats: null }).status).toBe("pending");
    expect(resolvePick({ now: after, lockAt, gameCompleted: false, stats: null }).status).toBe("locked");
  });

  it("scores a played game", () => {
    const r = resolvePick({ now: after, lockAt, gameCompleted: true, stats: { ...line({ recYds: 88, recTd: 1 }), appeared: true } });
    expect(r).toEqual({ status: "final", points: 14, reviewReason: null });
  });

  it("a confirmed did-not-play releases the player (dnp, 0 points)", () => {
    const r = resolvePick({ now: after, lockAt, gameCompleted: true, stats: { ...line({}), appeared: false } });
    expect(r).toEqual({ status: "dnp", points: 0, reviewReason: null });
  });

  it("no box-score row: burned with 0 points and flagged for review, not silently released", () => {
    const r = resolvePick({ now: after, lockAt, gameCompleted: true, stats: null });
    expect(r).toEqual({ status: "final", points: 0, reviewReason: NO_STATS_REVIEW });
  });

  it("played with zero stats (manual appeared = true) is burned with 0 points", () => {
    const r = resolvePick({ now: after, lockAt, gameCompleted: true, stats: { ...line({}), appeared: true } });
    expect(r).toEqual({ status: "final", points: 0, reviewReason: null });
  });
});
