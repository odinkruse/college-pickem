import type { Candidate, Classification, GameInfo, GameSide, PickContext, Slot } from "./types";

export type ViolationCode =
  | "not_in_game"
  | "position"
  | "ineligible_division"
  | "lower_division_opponent"
  | "wrong_week"
  | "locked"
  | "slot_locked"
  | "already_used"
  | "not_conference_game"
  | "conference_mismatch"
  | "favored"
  | "no_line";

export type Violation = { code: ViolationCode; message: string };

/** Roster positions that can fill each slot. ATH / unlisted players need a position override. */
export const SLOT_POSITIONS: Record<Slot, readonly string[]> = {
  QB: ["QB"],
  RB: ["RB", "FB"],
  WRTE: ["WR", "TE"],
};

const SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };

const DIVISION_RANK: Record<Classification, number> = { fbs: 4, fcs: 3, ii: 2, iii: 1 };
const rank = (c: Classification | null) => (c ? DIVISION_RANK[c] : 0);

/** The candidate's team and its opponent, or null if the team isn't in the game. */
function sides(game: GameInfo, teamId: number): { team: GameSide; opponent: GameSide; isHome: boolean } | null {
  if (game.home.teamId === teamId) return { team: game.home, opponent: game.away, isHome: true };
  if (game.away.teamId === teamId) return { team: game.away, opponent: game.home, isHome: false };
  return null;
}

export type UnderdogStatus = "underdog" | "favored" | "unknown";

/**
 * Whether a team counts as "not favored" for Underdog Week.
 *   spread > 0 or exactly 0 (pick'em) → underdog; spread < 0 → favored.
 *   No line: a team facing a higher division (FCS at FBS) is the underdog; otherwise unknown
 *   until someone enters a line by hand.
 */
export function underdogStatus(game: GameInfo, teamId: number): UnderdogStatus {
  const s = sides(game, teamId);
  if (!s) return "unknown";
  if (game.spreadHome === null) {
    return rank(s.team.classification) < rank(s.opponent.classification) ? "underdog" : "unknown";
  }
  const teamSpread = s.isHome ? game.spreadHome : -game.spreadHome;
  return teamSpread < 0 ? "favored" : "underdog";
}

/**
 * Every reason this player can't go in this slot this week. Empty array = eligible.
 * Returns all violations rather than the first, so the UI can explain everything at once.
 */
export function validatePick(c: Candidate, ctx: PickContext): Violation[] {
  const violations: Violation[] = [];
  const add = (code: ViolationCode, message: string) => violations.push({ code, message });

  const s = sides(c.game, c.teamId);
  if (!s) return [{ code: "not_in_game", message: "That player's team isn't playing in this game." }];
  const { team, opponent } = s;

  // Slot / position
  if (!c.position || !SLOT_POSITIONS[ctx.slot].includes(c.position)) {
    add("position", `${c.position ?? "Unlisted position"} can't fill the ${SLOT_LABEL[ctx.slot]} slot.`);
  }

  // Divisions: FBS/FCS players only, and never against a lower division.
  if (team.classification !== "fbs" && team.classification !== "fcs") {
    add("ineligible_division", "Only FBS and FCS players are eligible.");
  } else if (rank(opponent.classification) < rank(team.classification)) {
    add(
      "lower_division_opponent",
      `${team.classification.toUpperCase()} players can't be picked against a lower-division opponent.`,
    );
  }

  // Timing
  if (c.game.week !== ctx.week) add("wrong_week", `That game is in week ${c.game.week}, not week ${ctx.week}.`);
  if (ctx.now >= c.game.lockAt) add("locked", "That game has already kicked off.");

  const current = ctx.entryPicks.find((p) => p.week === ctx.week && p.slot === ctx.slot);
  if (current && ctx.now >= current.lockAt) {
    add("slot_locked", `Your ${SLOT_LABEL[ctx.slot]} pick for this week is already locked.`);
  }

  // Single use: any non-DNP pick of this player, other than the pick being replaced.
  const used = ctx.entryPicks.find(
    (p) => p.playerId === c.playerId && p.status !== "dnp" && !(p.week === ctx.week && p.slot === ctx.slot),
  );
  if (used) add("already_used", `Already used in week ${used.week}.`);

  // Special weeks
  if (ctx.weekRule === "conference") {
    if (team.conferenceId === null || team.conferenceId !== opponent.conferenceId) {
      add("not_conference_game", "Conference week: both teams in the game must be from the same conference.");
    }
    const others = ctx.entryPicks.filter((p) => p.week === ctx.week && p.slot !== ctx.slot);
    if (others.some((p) => p.teamConferenceId !== team.conferenceId)) {
      add("conference_mismatch", "Conference week: all three picks must be from the same conference.");
    }
  }

  if (ctx.weekRule === "underdog") {
    const status = underdogStatus(c.game, c.teamId);
    if (status === "favored") add("favored", "Underdog week: his team is favored.");
    if (status === "unknown") add("no_line", "Underdog week: there's no line for this game yet. Enter one by hand.");
  }

  return violations;
}
