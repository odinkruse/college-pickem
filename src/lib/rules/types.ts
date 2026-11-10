// Shared vocabulary for the rules engine. Plain data only: no database, framework or I/O,
// so every rule can be unit-tested and run identically in the browser and on the server.

export type Classification = "fbs" | "fcs" | "ii" | "iii";
export type Slot = "QB" | "RB" | "WRTE";
export type WeekRule = "standard" | "conference" | "underdog";
export type PickStatus = "pending" | "locked" | "final" | "dnp";

export type ScoringRules = {
  passYdsPerPoint: number;
  rushYdsPerPoint: number;
  recYdsPerPoint: number;
  touchdown: number;
  turnover: number;
};

/** Mirrors the default in seasons.scoring_rules. */
export const DEFAULT_SCORING: ScoringRules = {
  passYdsPerPoint: 25,
  rushYdsPerPoint: 10,
  recYdsPerPoint: 10,
  touchdown: 6,
  turnover: -2,
};

export type StatLine = {
  passYds: number;
  rushYds: number;
  recYds: number;
  passTd: number;
  rushTd: number;
  recTd: number;
  interceptions: number;
  fumblesLost: number;
};

/** One team's side of a game, with that team's division and conference for the season. */
export type GameSide = {
  teamId: number;
  classification: Classification | null;
  conferenceId: number | null;
};

export type GameInfo = {
  id: number;
  week: number;
  lockAt: Date;
  home: GameSide;
  away: GameSide;
  /** The line used for Underdog Week, home team's perspective (negative = home favored). */
  spreadHome: number | null;
};

/** A player being considered for a slot. `position` is the effective one (override ?? roster). */
export type Candidate = {
  playerId: number;
  teamId: number;
  position: string | null;
  game: GameInfo;
};

/** A pick the entry already has this season (any week, any status). */
export type EntryPick = {
  week: number;
  slot: Slot;
  playerId: number;
  status: PickStatus;
  teamConferenceId: number | null;
  lockAt: Date;
};

export type PickContext = {
  now: Date;
  week: number;
  slot: Slot;
  weekRule: WeekRule;
  entryPicks: EntryPick[];
};
