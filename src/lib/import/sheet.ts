// Reading the league's Google Sheet ("CFB Fantasy <year> Rosters"): one tab per member, a row per
// week, columns Week | QB | RB | WR, each cell "Player Name - School". The sheet is shared by link,
// so its CSV export needs no Google credentials. Parsing is pure; the fetches are at the bottom.

import type { Slot } from "@/lib/rules";

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type SheetPick = { week: number; slot: Slot; text: string };

const HEADER_SLOTS: Record<string, Slot> = { QB: "QB", RB: "RB", WR: "WRTE", TE: "WRTE", "WR/TE": "WRTE" };

/** The usual layout when the header row is missing or has been typed over: Week | QB | RB | WR. */
const DEFAULT_COLUMNS: { i: number; slot: Slot }[] = [
  { i: 1, slot: "QB" },
  { i: 2, slot: "RB" },
  { i: 3, slot: "WRTE" },
];

/**
 * One member's tab → non-empty pick cells. Columns come from the header when it names all three
 * slots, otherwise the default layout. Rows whose first column isn't a week number are skipped
 * (and returned in `skipped` so the import can mention them).
 */
export function parseMemberTab(rows: string[][]): { picks: SheetPick[]; skipped: string[] } {
  const header = (rows[0] ?? []).map((h) => h.trim().toUpperCase());
  const fromHeader = header.flatMap((h, i) => (HEADER_SLOTS[h] ? [{ i, slot: HEADER_SLOTS[h] }] : []));
  const slotCols = new Set(fromHeader.map((c) => c.slot)).size === 3 ? fromHeader : DEFAULT_COLUMNS;
  const weekCol = Math.max(0, header.indexOf("WEEK"));

  const picks: SheetPick[] = [];
  const skipped: string[] = [];
  rows.forEach((r, n) => {
    const weekText = r[weekCol]?.trim() ?? "";
    const week = Number(weekText);
    const cells = slotCols.map(({ i, slot }) => ({ slot, text: r[i]?.trim() ?? "" })).filter((c) => c.text && !HEADER_SLOTS[c.text.toUpperCase()]);
    if (weekText === "" || !Number.isInteger(week) || week < 0 || week > 20) {
      // Report rows with text in them, except a genuine header row (only labels like Week/QB/RB/WR).
      const isHeader = n === 0 && (weekText === "" || weekText.toUpperCase() === "WEEK");
      if (!isHeader && (cells.length || weekText)) {
        skipped.push(`row ${n + 1}: ${[weekText, ...cells.map((c) => c.text)].filter(Boolean).join(" | ")}`);
      }
      return;
    }
    for (const c of cells) picks.push({ week, ...c });
  });
  return { picks, skipped };
}

/** "Michael Hawkins, Jr. - West Virginia" → name + school. Splits on the last " - ". */
export function splitPickCell(text: string): { name: string; school: string | null } {
  const at = text.lastIndexOf(" - ");
  if (at < 0) return { name: text.trim(), school: null };
  return { name: text.slice(0, at).trim(), school: text.slice(at + 3).trim() || null };
}

/** Tab names from the sheet's public HTML view. Unofficial page structure, so callers need a fallback. */
export function parseTabNames(html: string): string[] {
  return [...html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
}

// --- Scoring sheet ("CFB Fantasy Scoring <year>"): a tab per week, a row per member, and per slot
// Passing | Rushing | Receiving | TD | Turnover | Points.

const SCORING_SLOTS: Slot[] = ["QB", "RB", "WRTE"];

export type SheetLine = { pass: number; rush: number; rec: number; td: number; to: number; points: number };

/** Pure: a week tab's CSV → member name → per-slot line. Columns are found from the header text. */
export function parseScoringTab(rows: string[][]): Map<string, Partial<Record<Slot, SheetLine>>> {
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim() === "Passing"));
  if (headerAt < 0) return new Map();
  const pointCols = rows[headerAt].flatMap((c, i) => (/\bPoints$/.test(c.trim()) && !/Total/.test(c) ? [i] : []));
  const num = (s: string | undefined) => Number((s ?? "").trim() || 0) || 0;

  const out = new Map<string, Partial<Record<Slot, SheetLine>>>();
  for (const r of rows.slice(headerAt + 1)) {
    const name = r[0]?.trim();
    if (!name) continue;
    const lines: Partial<Record<Slot, SheetLine>> = {};
    pointCols.slice(0, 3).forEach((p, i) => {
      if (r.slice(p - 5, p + 1).every((c) => !c?.trim())) return; // nothing entered for this slot
      lines[SCORING_SLOTS[i]] = { pass: num(r[p - 5]), rush: num(r[p - 4]), rec: num(r[p - 3]), td: num(r[p - 2]), to: num(r[p - 1]), points: num(r[p]) };
    });
    out.set(name, lines);
  }
  return out;
}

const sheetUrl = (sheetId: string, path: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/${path}`;

export async function fetchTabNames(sheetId: string): Promise<string[]> {
  const res = await fetch(sheetUrl(sheetId, "htmlview"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets returned ${res.status} listing tabs`);
  return parseTabNames(await res.text());
}

export async function fetchTabCsv(sheetId: string, tab: string): Promise<string[][]> {
  const res = await fetch(sheetUrl(sheetId, `gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`), { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets returned ${res.status} for tab "${tab}"`);
  if (!(res.headers.get("content-type") ?? "").includes("text/csv")) {
    throw new Error(`Tab "${tab}" didn't come back as CSV. Is the sheet still shared by link?`);
  }
  return parseCsv(await res.text());
}
