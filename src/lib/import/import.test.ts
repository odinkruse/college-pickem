import { describe, expect, it } from "vitest";
import { matchPick, matchTeam, normalizeName, type WeekIndex } from "./match";
import { parseCsv, parseMemberTab, parseTabNames, splitPickCell } from "./sheet";

describe("sheet parsing", () => {
  it("parses quoted CSV with commas and doubled quotes", () => {
    expect(parseCsv('"a","b, c","say ""hi"""\r\n"1","",x\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "", "x"],
    ]);
  });

  it("reads picks by header and skips empty weeks", () => {
    const { picks, skipped } = parseMemberTab([
      ["Week", "QB", "RB", "WR"],
      ["1", "A Qb - X", "B Rb - Y", "C Wr - Z"],
      ["2", "", "", ""],
    ]);
    expect(picks).toEqual([
      { week: 1, slot: "QB", text: "A Qb - X" },
      { week: 1, slot: "RB", text: "B Rb - Y" },
      { week: 1, slot: "WRTE", text: "C Wr - Z" },
    ]);
    expect(skipped).toEqual([]);
  });

  it("falls back to the default layout when the header was typed over, and reports that row", () => {
    const { picks, skipped } = parseMemberTab([
      ["Kevin Jennings - SMU", "Jadan Baugh - Florida", "JJ Buchanan - Michigan", "WR"],
      ["1", "Byrum Brown - Auburn", "Justice Haynes - Georgia Tech", "Ian Strong - Alabama"],
    ]);
    expect(picks.map((p) => p.slot)).toEqual(["QB", "RB", "WRTE"]);
    expect(skipped).toHaveLength(1);
  });

  it("accepts a blank Week header", () => {
    expect(parseMemberTab([["", "QB", "RB", "WR"], ["3", "A B - C", "", ""]]).picks).toEqual([{ week: 3, slot: "QB", text: "A B - C" }]);
  });

  it("splits on the last ' - '", () => {
    expect(splitPickCell("Kameron McDowell-Moore - Elon")).toEqual({ name: "Kameron McDowell-Moore", school: "Elon" });
    expect(splitPickCell("Michael Hawkins, Jr. - West Virginia")).toEqual({ name: "Michael Hawkins, Jr.", school: "West Virginia" });
    expect(splitPickCell("Just A Name")).toEqual({ name: "Just A Name", school: null });
  });

  it("reads tab names from the HTML view", () => {
    expect(parseTabNames('items.push({name: "Josh B", pageUrl: "x"}); items.push({name: "Odin", pageUrl: "y"})')).toEqual(["Josh B", "Odin"]);
  });
});

const index: WeekIndex = {
  teams: [
    { id: 1, school: "Miami", abbreviation: "MIA" },
    { id: 2, school: "Miami (OH)", abbreviation: "M-OH" },
    { id: 3, school: "Pittsburgh", abbreviation: "PITT" },
    { id: 4, school: "USC", abbreviation: "USC" },
    { id: 5, school: "Ohio State", abbreviation: "OSU" },
  ],
  players: [
    { id: 10, name: "Malachi Toney", teamId: 1, position: "WR" },
    { id: 11, name: "Mason Heintschel", teamId: 3, position: "QB" },
    { id: 12, name: "Jayden Maiava", teamId: 4, position: "QB" },
    { id: 13, name: "Jeremiah Smith", teamId: 5, position: "WR" },
    { id: 14, name: "Jeremiah Smith", teamId: 2, position: "RB" },
    { id: 15, name: "Michael Hawkins Jr.", teamId: 3, position: "QB" },
  ],
  withStats: new Set([10, 11, 12, 13]),
};

describe("matching", () => {
  it("normalizes punctuation, accents and suffixes", () => {
    expect(normalizeName("Michael Hawkins, Jr.")).toBe("michael hawkins");
    expect(normalizeName("Keali'i Ah Yat")).toBe("kealii ah yat");
    expect(normalizeName("José Núñez III")).toBe("jose nunez");
  });

  it("resolves school aliases and typos without confusing the two Miamis", () => {
    expect(matchTeam("Pitt", index.teams)?.id).toBe(3);
    expect(matchTeam("Miami", index.teams)?.id).toBe(1);
    expect(matchTeam("Miami (OH)", index.teams)?.id).toBe(2);
    expect(matchTeam("Miama", index.teams)?.id).toBe(1);
  });

  it("matches exact, suffix-insensitive and wrong-first-name cells", () => {
    expect(matchPick("Malachi Toney - Miama", "WRTE", index)).toMatchObject({ ok: true, playerId: 10 });
    expect(matchPick("Michael Hawkins - Pitt", "QB", index)).toMatchObject({ ok: true, playerId: 15, note: null });
    expect(matchPick("Jordan Maiava - USC", "QB", index)).toMatchObject({ ok: true, playerId: 12, note: "last name only" });
  });

  it("uses the named school to pick between same-name players", () => {
    expect(matchPick("Jeremiah Smith - Ohio State", "WRTE", index)).toMatchObject({ ok: true, playerId: 13, teamId: 5 });
  });

  it("falls back to an exact name elsewhere only when the school is wrong", () => {
    expect(matchPick("Mason Heintschel - Oregon State", "QB", index)).toMatchObject({ ok: true, playerId: 11, teamId: 3 });
  });

  it("reports what it couldn't match, with suggestions", () => {
    const m = matchPick("Nobody Here - USC", "QB", index);
    expect(m.ok).toBe(false);
    expect(!m.ok && m.suggestions[0]).toEqual({ playerId: 12, label: "Jayden Maiava (USC)" });
  });
});
