// Parsing and checking the "Start a new season" form (/admin/season). Pure, so it's unit-tested; the
// action passes the result to the start_season database function.

import { parseWeekSettings, type WeekSettings } from "./week-settings";

export type StartSeasonPayload = {
  year: number;
  pick_sheet_id: string | null;
  scoring_sheet_id: string | null;
  last_week: number;
  weeks: WeekSettings["weeks"];
  members: { profile_id: string; display_name: string; contact_email: string; phone: string; returning: boolean }[];
  new_members: { display_name: string; contact_email: string; phone: string }[];
};

export type ParseResult = { ok: true; payload: StartSeasonPayload } | { ok: false; errors: string[] };

/** A Google Sheet id from a pasted URL (…/spreadsheets/d/<id>/edit…) or a bare id; "" → null. */
export function parseSheetId(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(t)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Form fields: year, pick_sheet, scoring_sheet, last_week, conference_week, underdog_week,
 * championship_week; for each existing member i: m{i}_id, m{i}_name, m{i}_email, m{i}_phone,
 * m{i}_returning ("on" when ticked); for each new-member row i: n{i}_name, n{i}_email, n{i}_phone
 * (rows with no name are ignored).
 */
export function parseStartSeason(form: FormData, currentYear: number): ParseResult {
  const errors: string[] = [];
  const get = (name: string) => String(form.get(name) ?? "").trim();

  const year = Number(get("year"));
  if (!Number.isInteger(year) || year <= currentYear || year > currentYear + 5) {
    errors.push(`Year must be after ${currentYear}.`);
  }

  const { last_week: lastWeek, weeks } = parseWeekSettings(form, errors);

  const sheets = { pick: parseSheetId(get("pick_sheet")), scoring: parseSheetId(get("scoring_sheet")) };
  if (sheets.pick === undefined) errors.push("The pick sheet link doesn't look like a Google Sheets link.");
  if (sheets.scoring === undefined) errors.push("The scoring sheet link doesn't look like a Google Sheets link.");

  const contact = (who: string, email: string) => {
    if (email && !EMAIL.test(email)) errors.push(`${who}: "${email}" isn't an email address.`);
  };

  const members: StartSeasonPayload["members"] = [];
  for (let i = 0; form.has(`m${i}_id`); i++) {
    const m = {
      profile_id: get(`m${i}_id`),
      display_name: get(`m${i}_name`),
      contact_email: get(`m${i}_email`),
      phone: get(`m${i}_phone`),
      returning: form.get(`m${i}_returning`) === "on",
    };
    if (!m.display_name) errors.push(`Member ${i + 1} needs a name.`);
    contact(m.display_name || `Member ${i + 1}`, m.contact_email);
    members.push(m);
  }

  const newMembers: StartSeasonPayload["new_members"] = [];
  for (let i = 0; form.has(`n${i}_name`); i++) {
    const n = { display_name: get(`n${i}_name`), contact_email: get(`n${i}_email`), phone: get(`n${i}_phone`) };
    if (!n.display_name) {
      if (n.contact_email || n.phone) errors.push(`New member row ${i + 1} has contact details but no name.`);
      continue;
    }
    contact(n.display_name, n.contact_email);
    newMembers.push(n);
  }

  // Names must be unique among everyone in the league (standings and sheet tabs go by name).
  const seen = new Map<string, number>();
  for (const name of [...members.map((m) => m.display_name), ...newMembers.map((n) => n.display_name)]) {
    if (name) seen.set(name.toLowerCase(), (seen.get(name.toLowerCase()) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
  if (dupes.length) errors.push(`Names must be unique: ${dupes.join(", ")}.`);

  if (!members.some((m) => m.returning) && newMembers.length === 0) errors.push("Nobody is playing: tick returning members or add new ones.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      year,
      pick_sheet_id: sheets.pick ?? null,
      scoring_sheet_id: sheets.scoring ?? null,
      last_week: lastWeek,
      weeks,
      members,
      new_members: newMembers,
    },
  };
}
