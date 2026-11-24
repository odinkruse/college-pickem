// The season's last week and special weeks, as entered on /admin/season and /admin/weeks. Pure, so
// it's unit-tested.

export type SpecialRule = "conference" | "underdog" | "championship";
export type WeekSettings = { last_week: number; weeks: { week: number; rule: SpecialRule }[] };

/** Form field, rule, label: one number input per special week (blank = none that season). */
export const SPECIAL_WEEKS = [
  ["conference_week", "conference", "Conference week"],
  ["underdog_week", "underdog", "Underdog week"],
  ["championship_week", "championship", "Championship week"],
] as const;

/** Reads last_week and the special-week fields, adding any problems to `errors`. */
export function parseWeekSettings(form: FormData, errors: string[]): WeekSettings {
  const get = (name: string) => String(form.get(name) ?? "").trim();

  const lastWeek = Number(get("last_week"));
  if (!Number.isInteger(lastWeek) || lastWeek < 1 || lastWeek > 20) errors.push("Last week must be between 1 and 20.");

  const weeks: WeekSettings["weeks"] = [];
  for (const [field, rule, label] of SPECIAL_WEEKS) {
    const raw = get(field);
    if (!raw) continue;
    const week = Number(raw);
    if (!Number.isInteger(week) || week < 1 || week > lastWeek) {
      errors.push(`${label} must be a week from 1 to ${lastWeek}, or blank.`);
    } else if (weeks.some((w) => w.week === week)) {
      errors.push(`Week ${week} can only be one special week.`);
    } else {
      weeks.push({ week, rule });
    }
  }
  return { last_week: lastWeek, weeks };
}

/** Weeks whose type differs between two settings (for warning about weeks already under way). */
export function changedWeeks(before: WeekSettings["weeks"], after: WeekSettings["weeks"]): number[] {
  const ruleOf = (list: WeekSettings["weeks"], week: number) => list.find((w) => w.week === week)?.rule ?? "standard";
  const all = new Set([...before, ...after].map((w) => w.week));
  return [...all].filter((w) => ruleOf(before, w) !== ruleOf(after, w)).sort((a, b) => a - b);
}
