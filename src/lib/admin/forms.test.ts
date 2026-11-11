import { describe, expect, it } from "vitest";
import { parseManualSpread, parseManualStats, parseNewPlayer, parseOverride } from "./forms";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseManualSpread", () => {
  it("stores the home team's side: home favored is negative", () => {
    expect(parseManualSpread("home", "3.5")).toEqual({ ok: true, value: -3.5 });
    expect(parseManualSpread("away", "7")).toEqual({ ok: true, value: 7 });
  });
  it("pick'em is 0 regardless of points", () => {
    expect(parseManualSpread("pickem", "")).toEqual({ ok: true, value: 0 });
  });
  it("rejects missing, negative, huge and non-half-point spreads", () => {
    expect(parseManualSpread("home", "").ok).toBe(false);
    expect(parseManualSpread("home", "-3").ok).toBe(false);
    expect(parseManualSpread("home", "150").ok).toBe(false);
    expect(parseManualSpread("home", "3.25").ok).toBe(false);
    expect(parseManualSpread("", "3").ok).toBe(false);
  });
});

describe("parseManualStats", () => {
  it("blank fields are 0 and negative yards are allowed", () => {
    const r = parseManualStats(form({ appeared: "on", rush_yds: "-12", rush_td: "1" }));
    expect(r).toEqual({
      ok: true,
      value: { pass_yds: 0, pass_td: 0, interceptions: 0, rush_yds: -12, rush_td: 1, rec_yds: 0, rec_td: 0, fumbles_lost: 0, appeared: true, note: null },
    });
  });
  it("did-not-play with no stats is fine", () => {
    const r = parseManualStats(form({ note: " zero snaps " }));
    expect(r.ok && r.value.appeared).toBe(false);
    expect(r.ok && r.value.note).toBe("zero snaps");
  });
  it("rejects stats on a did-not-play line", () => {
    expect(parseManualStats(form({ rec_yds: "10" })).ok).toBe(false);
  });
  it("rejects fractions and out-of-range values", () => {
    expect(parseManualStats(form({ appeared: "on", pass_yds: "12.5" })).ok).toBe(false);
    expect(parseManualStats(form({ appeared: "on", pass_td: "-1" })).ok).toBe(false);
  });
});

describe("players", () => {
  it("parses overrides; blank clears", () => {
    expect(parseOverride("WR")).toEqual({ ok: true, value: "WR" });
    expect(parseOverride("")).toEqual({ ok: true, value: null });
    expect(parseOverride("K").ok).toBe(false);
  });
  it("parses a new player", () => {
    expect(parseNewPlayer(form({ name: "  Joe   Smith ", team: "12", position: "RB", jersey: "" }))).toEqual({
      ok: true,
      value: { name: "Joe Smith", teamId: 12, position: "RB", jersey: null },
    });
    expect(parseNewPlayer(form({ name: "Joe", team: "12", position: "RB" })).ok).toBe(false);
    expect(parseNewPlayer(form({ name: "Joe Smith", team: "", position: "RB" })).ok).toBe(false);
    expect(parseNewPlayer(form({ name: "Joe Smith", team: "12", position: "" })).ok).toBe(false);
  });
});
