// Pure parsing for the manual-override forms on /admin. No I/O, so it is unit-tested and shared
// by the Server Actions. Every function returns either a value or a readable error.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Reads a whole number in [min, max]. Blank counts as 0. */
function intField(raw: FormDataEntryValue | null, label: string, min: number, max: number): Parsed<number> {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: 0 };
  const n = Number(text);
  if (!Number.isInteger(n)) return fail(`${label} must be a whole number.`);
  if (n < min || n > max) return fail(`${label} must be between ${min} and ${max}.`);
  return { ok: true, value: n };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type Favorite = "home" | "away" | "pickem";

/**
 * A hand-entered line as "who is favored, by how much", converted to the stored convention:
 * spread from the home team's side, negative = home favored. Half points only.
 */
export function parseManualSpread(favorite: string, points: FormDataEntryValue | null): Parsed<number> {
  if (favorite === "pickem") return { ok: true, value: 0 };
  if (favorite !== "home" && favorite !== "away") return fail("Choose the favorite.");
  const n = Number(String(points ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return fail("Enter how many points the favorite is giving (e.g. 3.5).");
  if (n > 99) return fail("That spread is too large.");
  if (!Number.isInteger(n * 2)) return fail("Spreads go in half points (3, 3.5, 4…).");
  return { ok: true, value: favorite === "home" ? -n : n };
}

// ---------------------------------------------------------------------------
// Stat lines
// ---------------------------------------------------------------------------

/** Column names match player_game_stats. */
export type ManualStats = {
  pass_yds: number;
  pass_td: number;
  interceptions: number;
  rush_yds: number;
  rush_td: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
  appeared: boolean;
  note: string | null;
};

export const STAT_FIELDS = [
  { name: "pass_yds", label: "Pass yds", min: -99, max: 999 },
  { name: "pass_td", label: "Pass TD", min: 0, max: 15 },
  { name: "interceptions", label: "INT", min: 0, max: 15 },
  { name: "rush_yds", label: "Rush yds", min: -99, max: 999 },
  { name: "rush_td", label: "Rush TD", min: 0, max: 15 },
  { name: "rec_yds", label: "Rec yds", min: -99, max: 999 },
  { name: "rec_td", label: "Rec TD", min: 0, max: 15 },
  { name: "fumbles_lost", label: "Fum lost", min: 0, max: 15 },
] as const satisfies readonly { name: keyof ManualStats; label: string; min: number; max: number }[];

/**
 * A stat line from the edit form. `appeared` unchecked means "did not play" (zero snaps), which
 * releases a picked player, so it can't be combined with stats.
 */
export function parseManualStats(form: FormData): Parsed<ManualStats> {
  const values: Partial<Record<(typeof STAT_FIELDS)[number]["name"], number>> = {};
  for (const f of STAT_FIELDS) {
    const r = intField(form.get(f.name), f.label, f.min, f.max);
    if (!r.ok) return r;
    values[f.name] = r.value;
  }
  const appeared = form.get("appeared") === "on";
  if (!appeared && Object.values(values).some((v) => v !== 0)) {
    return fail("A player who didn't play can't have stats. Tick \"Played\" or clear the stats.");
  }
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  return { ok: true, value: { ...(values as Record<(typeof STAT_FIELDS)[number]["name"], number>), appeared, note } };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export const OVERRIDE_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type OverridePosition = (typeof OVERRIDE_POSITIONS)[number];

/** "" clears the override (the roster position applies again). */
export function parseOverride(raw: FormDataEntryValue | null): Parsed<OverridePosition | null> {
  const v = String(raw ?? "");
  if (v === "") return { ok: true, value: null };
  return (OVERRIDE_POSITIONS as readonly string[]).includes(v) ? { ok: true, value: v as OverridePosition } : fail("Unknown position.");
}

export type NewPlayer = { name: string; teamId: number; position: OverridePosition; jersey: number | null };

export function parseNewPlayer(form: FormData): Parsed<NewPlayer> {
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || !name.includes(" ")) return fail("Enter the player's first and last name.");
  if (name.length > 80) return fail("That name is too long.");
  const teamId = Number(form.get("team"));
  if (!Number.isInteger(teamId) || teamId <= 0) return fail("Choose a team.");
  const position = parseOverride(form.get("position"));
  if (!position.ok) return position;
  if (position.value === null) return fail("Choose a position.");
  const jerseyText = String(form.get("jersey") ?? "").trim();
  let jersey: number | null = null;
  if (jerseyText !== "") {
    const j = Number(jerseyText);
    if (!Number.isInteger(j) || j < 0 || j > 99) return fail("Jersey must be 0–99.");
    jersey = j;
  }
  return { ok: true, value: { name, teamId, position: position.value, jersey } };
}
