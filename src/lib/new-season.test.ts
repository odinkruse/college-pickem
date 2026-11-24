import { describe, expect, it } from "vitest";
import { parseSheetId, parseStartSeason } from "./new-season";

const SHEET = "1DTS03unWzJ_KZoNfnPvrrfJpZ6HCrFgaKqnB69Wz0uU";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const BASE = {
  year: "2027",
  pick_sheet: `https://docs.google.com/spreadsheets/d/${SHEET}/edit?gid=515693785#gid=515693785`,
  scoring_sheet: "",
  last_week: "14",
  conference_week: "7",
  underdog_week: "10",
  championship_week: "14",
  m0_id: "p-odin",
  m0_name: "Odin",
  m0_email: "odin@example.com",
  m0_phone: "",
  m0_returning: "on",
  m1_id: "p-nick",
  m1_name: "Nick",
  m1_email: "",
  m1_phone: "555-0100",
  n0_name: "Newbie",
  n0_email: "new@example.com",
  n0_phone: "",
  n1_name: "",
  n1_email: "",
  n1_phone: "",
};

describe("parseSheetId", () => {
  it("takes a URL or a bare id", () => {
    expect(parseSheetId(BASE.pick_sheet)).toBe(SHEET);
    expect(parseSheetId(SHEET)).toBe(SHEET);
    expect(parseSheetId("  ")).toBeNull();
    expect(parseSheetId("not a sheet")).toBeUndefined();
  });
});

describe("parseStartSeason", () => {
  it("builds the payload", () => {
    const r = parseStartSeason(form(BASE), 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ year: 2027, pick_sheet_id: SHEET, scoring_sheet_id: null, last_week: 14 });
    expect(r.payload.weeks).toEqual([
      { week: 7, rule: "conference" },
      { week: 10, rule: "underdog" },
      { week: 14, rule: "championship" },
    ]);
    // Unticked = not returning; blank new-member rows are skipped.
    expect(r.payload.members.map((m) => [m.display_name, m.returning])).toEqual([
      ["Odin", true],
      ["Nick", false],
    ]);
    expect(r.payload.new_members).toEqual([{ display_name: "Newbie", contact_email: "new@example.com", phone: "" }]);
  });

  it("rejects a year that isn't after the current season", () => {
    const r = parseStartSeason(form({ ...BASE, year: "2026" }), 2026);
    expect(r.ok ? [] : r.errors).toContain("Year must be after 2026.");
  });

  it("checks special weeks fit the season and don't overlap", () => {
    const r = parseStartSeason(form({ ...BASE, underdog_week: "7", championship_week: "15" }), 2026);
    expect(r.ok ? [] : r.errors).toEqual(["Week 7 can only be one special week.", "Championship week must be a week from 1 to 14, or blank."]);
  });

  it("requires unique names, valid emails and a sheet-looking link", () => {
    const r = parseStartSeason(form({ ...BASE, n0_name: "odin", m0_email: "nope", pick_sheet: "hello" }), 2026);
    expect(r.ok ? [] : r.errors).toEqual([
      "The pick sheet link doesn't look like a Google Sheets link.",
      'Odin: "nope" isn\'t an email address.',
      "Names must be unique: odin.",
    ]);
  });

  it("needs somebody playing", () => {
    const r = parseStartSeason(form({ ...BASE, m0_returning: "", n0_name: "", n0_email: "" }), 2026);
    expect(r.ok ? [] : r.errors).toEqual(["Nobody is playing: tick returning members or add new ones."]);
  });
});
