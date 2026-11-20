import { describe, expect, it } from "vitest";
import { contrast, PALETTES, teamPalette, themeCss, type PaletteName } from "./palette";

// Real CFBD colors, including the awkward ones: black primaries, gray alternates, missing colors.
const TEAMS: [string, string | null, string | null][] = [
  ["Michigan", "#00274c", "#ffcb05"],
  ["Texas Tech", "#c30020", "#000000"],
  ["Oklahoma State", "#fe5c00", "#000000"],
  ["Missouri", "#f1b82d", "#000000"],
  ["Ohio State", "#ba0c2f", "#a7b1b7"],
  ["Montana", "#751d4a", "#666666"],
  ["Navy", "#00225b", "#b5a67c"],
  ["Oregon", "#007030", "#fee11a"],
  ["Tarleton State", "#000000", null],
  ["No colors", null, null],
  ["White and gray", "#ffffff", "#888888"],
];

describe("teamPalette", () => {
  for (const base of ["field", "night", "arcade"] as PaletteName[]) {
    for (const [name, color, alt] of TEAMS) {
      it(`${name} on ${base} is readable everywhere`, () => {
        const p = teamPalette(color, alt, base);
        expect(contrast("#ffffff", p.background)).toBeGreaterThanOrEqual(4.5); // page titles on the field
        expect(contrast("#ffffff", p["field-2"])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p["muted-foreground"], p.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p["muted-foreground"], p.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.primary, p.card)).toBeGreaterThanOrEqual(4.5); // card titles
        expect(contrast(p.primary, "#000000")).toBeGreaterThanOrEqual(4.5); // black text on buttons / leader row
        expect(contrast(p.accent, p.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.accent, "#000000")).toBeGreaterThanOrEqual(4.5); // "You" tag
        expect(contrast("#ffffff", p.card)).toBeGreaterThanOrEqual(7);
      });
    }
  }

  it("uses the school colors", () => {
    const michigan = teamPalette("#00274c", "#ffcb05");
    expect(michigan.background).toBe("#00274c"); // navy is already dark enough
    expect(michigan.primary).toBe("#ffcb05"); // maize is already bright enough
  });

  it("never uses black as a highlight", () => {
    const tt = teamPalette("#c30020", "#000000");
    expect(tt.primary).not.toBe("#000000");
    expect(contrast(tt.primary, "#000000")).toBeGreaterThanOrEqual(6);
  });

  it("keeps the default field when a team has no colorful color", () => {
    expect(teamPalette("#000000", null).background).toBe(PALETTES.field.background);
    expect(teamPalette(null, null)).toEqual(PALETTES.field);
  });

  it("keeps a special week's field and panels", () => {
    const p = teamPalette("#00274c", "#ffcb05", "night");
    expect(p.background).toBe(PALETTES.night.background);
    expect(p.card).toBe(PALETTES.night.card);
    expect(p.primary).toBe("#ffcb05");
  });
});

describe("themeCss", () => {
  it("is empty for the default palette", () => expect(themeCss(PALETTES.field)).toBe(""));
  it("sets only what differs", () => {
    const css = themeCss({ ...PALETTES.field, primary: "#ffcb05" });
    expect(css).toBe(":root{--primary:#ffcb05}");
  });
});
