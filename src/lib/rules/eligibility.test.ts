import { describe, expect, it } from "vitest";
import { underdogStatus, validatePick, type ViolationCode } from "./eligibility";
import type { Candidate, Classification, EntryPick, GameInfo, PickContext, Slot, WeekRule } from "./types";

// --- Fixtures ---------------------------------------------------------------
// Team ids: 1 Michigan (FBS, Big Ten=10), 2 Ohio State (FBS, Big Ten), 3 Alabama (FBS, SEC=20),
// 4 Montana (FCS, Big Sky=30), 5 Montana State (FCS, Big Sky), 6 D-II school (no conference).

const NOW = new Date("2026-11-14T12:00:00Z");
const LATER = new Date("2026-11-14T20:00:00Z");
const EARLIER = new Date("2026-11-14T10:00:00Z");

const side = (teamId: number, classification: Classification, conferenceId: number | null) => ({
  teamId,
  classification,
  conferenceId,
});
const MICH = side(1, "fbs", 10);
const OSU = side(2, "fbs", 10);
const BAMA = side(3, "fbs", 20);
const MONT = side(4, "fcs", 30);
const MSU = side(5, "fcs", 30);
const D2 = side(6, "ii", null);

let gameId = 100;
function game(home: GameInfo["home"], away: GameInfo["away"], opts: Partial<GameInfo> = {}): GameInfo {
  return { id: gameId++, week: 12, lockAt: LATER, home, away, spreadHome: null, ...opts };
}

function candidate(teamId: number, g: GameInfo, position = "QB", playerId = 1): Candidate {
  return { playerId, teamId, position, game: g };
}

function ctx(opts: { slot?: Slot; weekRule?: WeekRule; entryPicks?: EntryPick[]; week?: number } = {}): PickContext {
  return { now: NOW, week: 12, slot: "QB", weekRule: "standard", entryPicks: [], ...opts };
}

function pick(p: Partial<EntryPick>): EntryPick {
  return { week: 12, slot: "RB", playerId: 99, status: "pending", teamConferenceId: 10, lockAt: LATER, ...p };
}

const codes = (c: Candidate, x: PickContext): ViolationCode[] => validatePick(c, x).map((v) => v.code);

// --- Tests ------------------------------------------------------------------

describe("baseline", () => {
  it("an FBS QB in an FBS game before kickoff is eligible", () => {
    expect(validatePick(candidate(1, game(MICH, OSU)), ctx())).toEqual([]);
  });

  it("rejects a team that isn't in the game", () => {
    expect(codes(candidate(3, game(MICH, OSU)), ctx())).toEqual(["not_in_game"]);
  });
});

describe("slot positions", () => {
  const g = game(MICH, OSU);
  it.each([
    ["QB", "QB", true],
    ["RB", "RB", true],
    ["RB", "FB", true],
    ["WRTE", "WR", true],
    ["WRTE", "TE", true],
    ["QB", "RB", false],
    ["WRTE", "RB", false],
    ["RB", "ATH", false],
  ] as const)("%s slot with a %s → eligible: %s", (slot, position, ok) => {
    expect(codes(candidate(1, g, position), ctx({ slot })).includes("position")).toBe(!ok);
  });

  it("an unlisted position needs an override", () => {
    const c = { ...candidate(1, g), position: null };
    expect(codes(c, ctx())).toEqual(["position"]);
  });
});

describe("divisions", () => {
  it("FCS player against an FBS opponent is legal", () => {
    expect(codes(candidate(4, game(BAMA, MONT)), ctx())).toEqual([]);
  });

  it("FBS player against an FCS opponent is not", () => {
    expect(codes(candidate(3, game(BAMA, MONT)), ctx())).toEqual(["lower_division_opponent"]);
  });

  it("FCS player against an FCS opponent is legal", () => {
    expect(codes(candidate(4, game(MONT, MSU)), ctx())).toEqual([]);
  });

  it("FCS player against a D-II opponent is not", () => {
    expect(codes(candidate(4, game(MONT, D2)), ctx())).toEqual(["lower_division_opponent"]);
  });

  it("D-II players are never eligible", () => {
    expect(codes(candidate(6, game(MONT, D2)), ctx())).toEqual(["ineligible_division"]);
  });
});

describe("timing", () => {
  it("rejects a game that has kicked off", () => {
    expect(codes(candidate(1, game(MICH, OSU, { lockAt: EARLIER })), ctx())).toEqual(["locked"]);
  });

  it("rejects exactly at kickoff", () => {
    expect(codes(candidate(1, game(MICH, OSU, { lockAt: NOW })), ctx())).toEqual(["locked"]);
  });

  it("rejects a game from a different week", () => {
    expect(codes(candidate(1, game(MICH, OSU, { week: 13 })), ctx())).toEqual(["wrong_week"]);
  });

  it("can't replace a slot whose current pick has locked", () => {
    const existing = pick({ slot: "QB", playerId: 50, lockAt: EARLIER });
    expect(codes(candidate(1, game(MICH, OSU)), ctx({ entryPicks: [existing] }))).toEqual(["slot_locked"]);
  });

  it("can replace a slot whose current pick hasn't locked", () => {
    const existing = pick({ slot: "QB", playerId: 50 });
    expect(codes(candidate(1, game(MICH, OSU)), ctx({ entryPicks: [existing] }))).toEqual([]);
  });
});

describe("single use", () => {
  const g = game(MICH, OSU);

  it("rejects a player used in an earlier week", () => {
    const used = pick({ week: 5, slot: "QB", playerId: 1, status: "final", lockAt: EARLIER });
    const v = validatePick(candidate(1, g), ctx({ entryPicks: [used] }));
    expect(v).toEqual([{ code: "already_used", message: "Already used in week 5." }]);
  });

  it("rejects a player queued as a pending pick in a later week", () => {
    const queued = pick({ week: 13, slot: "QB", playerId: 1 });
    expect(codes(candidate(1, g), ctx({ entryPicks: [queued] }))).toEqual(["already_used"]);
  });

  it("rejects the same player in another slot the same week", () => {
    const otherSlot = pick({ slot: "WRTE", playerId: 1 });
    expect(codes(candidate(1, g, "QB"), ctx({ entryPicks: [otherSlot] }))).toEqual(["already_used"]);
  });

  it("allows a player whose earlier pick was a DNP", () => {
    const dnp = pick({ week: 5, slot: "QB", playerId: 1, status: "dnp", lockAt: EARLIER });
    expect(codes(candidate(1, g), ctx({ entryPicks: [dnp] }))).toEqual([]);
  });

  it("re-picking the same player in the same slot (no change) is fine", () => {
    const same = pick({ slot: "QB", playerId: 1 });
    expect(codes(candidate(1, g), ctx({ entryPicks: [same] }))).toEqual([]);
  });
});

describe("conference week", () => {
  const conf = (entryPicks: EntryPick[] = []) => ctx({ weekRule: "conference", entryPicks });

  it("allows an in-conference game", () => {
    expect(codes(candidate(1, game(MICH, OSU)), conf())).toEqual([]);
  });

  it("rejects a non-conference game", () => {
    expect(codes(candidate(1, game(MICH, BAMA)), conf())).toEqual(["not_conference_game"]);
  });

  it("rejects a game against a team with no conference", () => {
    // FCS Montana vs FCS independent: independents have no conference to share.
    const indep = side(7, "fcs", null);
    expect(codes(candidate(4, game(MONT, indep)), conf())).toEqual(["not_conference_game"]);
  });

  it("FCS conferences count too", () => {
    expect(codes(candidate(4, game(MONT, MSU)), conf())).toEqual([]);
  });

  it("the first pick sets the conference: others must match", () => {
    const bigTenRb = pick({ slot: "RB", teamConferenceId: 10 });
    expect(codes(candidate(1, game(MICH, OSU)), conf([bigTenRb]))).toEqual([]);
    expect(codes(candidate(4, game(MONT, MSU)), conf([bigTenRb]))).toEqual(["conference_mismatch"]);
  });

  it("only this week's other slots matter", () => {
    const lastWeekSec = pick({ week: 11, slot: "RB", teamConferenceId: 20, lockAt: EARLIER, status: "final" });
    expect(codes(candidate(1, game(MICH, OSU)), conf([lastWeekSec]))).toEqual([]);
  });

  it("replacing the pick that set the conference is allowed when it's the only one", () => {
    const secQb = pick({ slot: "QB", playerId: 77, teamConferenceId: 20 });
    expect(codes(candidate(1, game(MICH, OSU)), conf([secQb]))).toEqual([]);
  });
});

describe("underdog week", () => {
  const dog = ctx({ weekRule: "underdog" });

  it("home underdog (+3.5) is eligible, the favored road team isn't", () => {
    const g = game(MICH, OSU, { spreadHome: 3.5 });
    expect(codes(candidate(1, g), dog)).toEqual([]);
    expect(codes(candidate(2, g), dog)).toEqual(["favored"]);
  });

  it("road underdog against a home favorite (−14) is eligible", () => {
    const g = game(MICH, OSU, { spreadHome: -14 });
    expect(codes(candidate(2, g), dog)).toEqual([]);
    expect(codes(candidate(1, g), dog)).toEqual(["favored"]);
  });

  it("a pick'em (0) counts as not favored for both teams", () => {
    const g = game(MICH, OSU, { spreadHome: 0 });
    expect(codes(candidate(1, g), dog)).toEqual([]);
    expect(codes(candidate(2, g), dog)).toEqual([]);
  });

  it("no line: an FCS team at an FBS team is the underdog", () => {
    expect(underdogStatus(game(BAMA, MONT), 4)).toBe("underdog");
    expect(codes(candidate(4, game(BAMA, MONT)), dog)).toEqual([]);
  });

  it("no line between equal divisions: unknown until a line is entered", () => {
    expect(codes(candidate(4, game(MONT, MSU)), dog)).toEqual(["no_line"]);
  });

  it("standard weeks ignore the line entirely", () => {
    expect(codes(candidate(1, game(MICH, OSU, { spreadHome: -30 })), ctx())).toEqual([]);
  });
});

describe("multiple problems", () => {
  it("reports every violation at once", () => {
    const g = game(BAMA, MONT, { lockAt: EARLIER, spreadHome: -40 });
    const used = pick({ week: 3, slot: "QB", playerId: 1, status: "final", lockAt: EARLIER });
    expect(codes(candidate(3, g, "RB"), ctx({ weekRule: "underdog", entryPicks: [used] })).sort()).toEqual(
      ["already_used", "favored", "locked", "lower_division_opponent", "position"].sort(),
    );
  });
});
