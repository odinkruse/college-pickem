import { describe, expect, it } from "vitest";
import { changedWeeks, parseWeekSettings } from "./week-settings";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("parseWeekSettings", () => {
  it("reads the special weeks, skipping blanks", () => {
    const errors: string[] = [];
    const r = parseWeekSettings(form({ last_week: "14", conference_week: "7", underdog_week: "", championship_week: "14" }), errors);
    expect(errors).toEqual([]);
    expect(r).toEqual({ last_week: 14, weeks: [{ week: 7, rule: "conference" }, { week: 14, rule: "championship" }] });
  });

  it("keeps special weeks inside the season", () => {
    const errors: string[] = [];
    parseWeekSettings(form({ last_week: "13", championship_week: "14" }), errors);
    expect(errors).toEqual(["Championship week must be a week from 1 to 13, or blank."]);
  });
});

describe("changedWeeks", () => {
  it("lists weeks whose type changes, including ones that become standard", () => {
    const before = [{ week: 7, rule: "conference" as const }, { week: 14, rule: "championship" as const }];
    const after = [{ week: 8, rule: "conference" as const }, { week: 14, rule: "championship" as const }];
    expect(changedWeeks(before, after)).toEqual([7, 8]);
    expect(changedWeeks(before, before)).toEqual([]);
  });
});
