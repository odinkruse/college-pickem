import { DEFAULT_SCORING, type PickStatus, type ScoringRules, type StatLine } from "./types";

/**
 * Yardage points for one category: whole increments only, truncated toward zero.
 * 19 yds → 1, −7 yds → 0, −12 yds → −1. Categories are never combined.
 * (`+ 0` turns JavaScript's −0 into 0.)
 */
const yardPoints = (yards: number, perPoint: number) => Math.trunc(yards / perPoint) + 0;

export type ScoreBreakdown = {
  passing: number;
  rushing: number;
  receiving: number;
  touchdowns: number;
  turnovers: number;
  total: number;
};

export function scoreBreakdown(s: StatLine, rules: ScoringRules = DEFAULT_SCORING): ScoreBreakdown {
  const passing = yardPoints(s.passYds, rules.passYdsPerPoint);
  const rushing = yardPoints(s.rushYds, rules.rushYdsPerPoint);
  const receiving = yardPoints(s.recYds, rules.recYdsPerPoint);
  // Passing, rushing and receiving TDs only; return / defensive TDs aren't in StatLine at all.
  const touchdowns = (s.passTd + s.rushTd + s.recTd) * rules.touchdown;
  // Only turnovers that change possession: interceptions thrown and fumbles lost.
  const turnovers = (s.interceptions + s.fumblesLost) * rules.turnover;
  return { passing, rushing, receiving, touchdowns, turnovers, total: passing + rushing + receiving + touchdowns + turnovers };
}

export const scoreStatLine = (s: StatLine, rules: ScoringRules = DEFAULT_SCORING) => scoreBreakdown(s, rules).total;

export type PickResolution = {
  status: PickStatus;
  points: number | null;
  /** Non-null puts the pick in the admin review queue. */
  reviewReason: string | null;
};

export const NO_STATS_REVIEW = "No box-score line. Did he play? Confirm DNP to release him, or mark as played.";

/**
 * What a pick's status and points should be right now.
 *
 * A finished game with no box-score row is ambiguous: box scores only list players who recorded
 * a stat, so a receiver who ran routes but was never targeted looks identical to one who sat.
 * Default to *burned with 0 points* and flag for review, rather than releasing the player:
 * if he were released and re-picked, then later confirmed as having played, the single-use rule
 * would be violated retroactively. Confirming the DNP (a manual stats row with appeared = false)
 * releases him.
 */
export function resolvePick(
  input: {
    now: Date;
    lockAt: Date;
    gameCompleted: boolean;
    stats: (StatLine & { appeared: boolean }) | null;
  },
  rules: ScoringRules = DEFAULT_SCORING,
): PickResolution {
  if (!input.gameCompleted) {
    return { status: input.now >= input.lockAt ? "locked" : "pending", points: null, reviewReason: null };
  }
  if (!input.stats) return { status: "final", points: 0, reviewReason: NO_STATS_REVIEW };
  if (!input.stats.appeared) return { status: "dnp", points: 0, reviewReason: null };
  return { status: "final", points: scoreStatLine(input.stats, rules), reviewReason: null };
}
