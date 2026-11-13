// Matching free-typed sheet cells ("Malachi Toney - Miama") to players. Pure: the caller builds a
// WeekIndex from the database for the week being imported (only teams playing that week), which
// keeps fuzzy matches from wandering to a different team's player.

import { SLOT_POSITIONS, type Slot } from "@/lib/rules";
import { splitPickCell } from "./sheet";

export type IndexTeam = { id: number; school: string; abbreviation: string | null };
export type IndexPlayer = { id: number; name: string; teamId: number; position: string | null };

export type WeekIndex = {
  teams: IndexTeam[];
  players: IndexPlayer[];
  /** Players with a box-score line this week: the tie-breaker when two names match. */
  withStats: Set<number>;
};

export type Match =
  | { ok: true; playerId: number; teamId: number; note: string | null }
  | { ok: false; reason: string; suggestions: Suggestion[] };

export type Suggestion = { playerId: number; label: string };

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lowercase, no accents or punctuation, no Jr./III suffixes. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`,]/g, "")
    .replace(/[-_/]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ");
}

/** What people type → CFBD's school name (normalized). Extend as the sheet throws up new ones. */
const SCHOOL_ALIASES: Record<string, string> = {
  pitt: "pittsburgh",
  fau: "florida atlantic",
  fiu: "florida international",
  connecticut: "uconn",
  "miami fl": "miami",
  "miami fla": "miami",
  "miami oh": "miami (oh)",
  usf: "south florida",
  ucf: "ucf",
  smu: "smu",
  tcu: "tcu",
  byu: "byu",
  lsu: "lsu",
  unlv: "unlv",
  utep: "utep",
  utsa: "utsa",
  "ole miss": "ole miss",
  "mississippi": "ole miss",
  "app state": "app state",
  "appalachian state": "app state",
  "southern miss": "southern miss",
  "southern mississippi": "southern miss",
  "nc state": "nc state",
  "north carolina state": "nc state",
  "hawaii": "hawai'i",
  "umass": "massachusetts",
  "ul monroe": "ul monroe",
  "louisiana monroe": "ul monroe",
  "louisiana lafayette": "louisiana",
  "sam houston state": "sam houston",
  "ga tech": "georgia tech",
  "uva": "virginia",
  "wazzu": "washington state",
  "wsu": "washington state",
};

const schoolKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Exact school/abbreviation/alias, then a unique close spelling ("Miama" → Miami). */
export function matchTeam(text: string, teams: IndexTeam[]): IndexTeam | null {
  const raw = schoolKey(text);
  const key = SCHOOL_ALIASES[raw.replace(/[()]/g, "").trim()] ?? raw;
  const keyOf = (t: IndexTeam) => schoolKey(t.school);
  const exact = teams.filter((t) => keyOf(t) === key || (t.abbreviation && schoolKey(t.abbreviation) === raw));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact.find((t) => keyOf(t) === key) ?? null;
  if (key.length < 5) return null;
  const close = teams.filter((t) => levenshtein(keyOf(t), key) <= (key.length >= 9 ? 2 : 1));
  return close.length === 1 ? close[0] : null;
}

/** Same last name and compatible first names: "Cam"/"Cameron", "KJ"/"K.J.", "Demond"/"Demond". */
function looseNameMatch(a: string, b: string): boolean {
  const [af, ...ar] = a.split(" ");
  const [bf, ...br] = b.split(" ");
  if (!af || !bf || ar.join(" ") !== br.join(" ") || ar.length === 0) return false;
  return af.startsWith(bf) || bf.startsWith(af);
}

/** Narrows several matches: a player with stats this week, then one whose position fits the slot. */
function pickOne(cands: IndexPlayer[], index: WeekIndex, slot: Slot): IndexPlayer | null {
  if (cands.length <= 1) return cands[0] ?? null;
  for (const filter of [(p: IndexPlayer) => index.withStats.has(p.id), (p: IndexPlayer) => SLOT_POSITIONS[slot].includes(p.position ?? "")]) {
    const narrowed = cands.filter(filter);
    if (narrowed.length === 1) return narrowed[0];
    if (narrowed.length > 1) cands = narrowed;
  }
  return null;
}

export function matchPick(text: string, slot: Slot, index: WeekIndex): Match {
  const { name, school } = splitPickCell(text);
  const key = normalizeName(name);
  if (!key) return { ok: false, reason: "Empty name", suggestions: [] };
  const team = school ? matchTeam(school, index.teams) : null;
  const keyed = index.players.map((p) => ({ p, key: normalizeName(p.name) }));

  const tiers: [string | null, (k: string) => boolean][] = [
    [null, (k) => k === key],
    ["close spelling", (k) => levenshtein(k, key) <= (key.length >= 10 ? 2 : 1)],
    ["first-name variant", (k) => looseNameMatch(k, key)],
  ];

  if (team) {
    const roster = keyed.filter((x) => x.p.teamId === team.id);
    for (const [note, test] of tiers) {
      const found = pickOne(roster.filter((x) => test(x.key)).map((x) => x.p), index, slot);
      if (found) return { ok: true, playerId: found.id, teamId: team.id, note };
    }
    // Wrong first name ("Jordan Maiava" for Jayden Maiava): the only player on that team with the
    // same last name who plays the slot's position.
    const words = key.split(" ");
    if (words.length >= 2) {
      const last = words.at(-1);
      const byLast = roster.filter((x) => x.key.split(" ").at(-1) === last && SLOT_POSITIONS[slot].includes(x.p.position ?? "")).map((x) => x.p);
      const found = pickOne(byLast, index, slot);
      if (found) return { ok: true, playerId: found.id, teamId: team.id, note: "last name only" };
    }
  }

  // Not on the named team (typo in the school, or a roster that hasn't caught up): exact name among
  // every team playing this week, only if that's unambiguous.
  const anywhere = pickOne(keyed.filter((x) => x.key === key).map((x) => x.p), index, slot);
  if (anywhere) {
    const school2 = index.teams.find((t) => t.id === anywhere.teamId)?.school;
    return { ok: true, playerId: anywhere.id, teamId: anywhere.teamId, note: school ? `found on ${school2}, sheet says ${school}` : null };
  }

  const pool = team ? keyed.filter((x) => x.p.teamId === team.id) : keyed;
  const suggestions = pool
    .map((x) => ({ x, d: levenshtein(x.key, key) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ x }) => ({ playerId: x.p.id, label: `${x.p.name} (${index.teams.find((t) => t.id === x.p.teamId)?.school})` }));
  return {
    ok: false,
    reason: !school ? "No school given" : !team ? `School "${school}" not found among this week's games` : `No "${name}" on ${team.school}`,
    suggestions,
  };
}
