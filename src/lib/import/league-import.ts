import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreWeek } from "@/lib/picks/scoring";
import { chooseSpread, lockAt, validatePick, type Classification, type EntryPick, type GameInfo, type Slot, type WeekRule } from "@/lib/rules";
import type { Database } from "@/lib/supabase/database.types";
import { chunks, must, ok, selectAll } from "@/lib/supabase/helpers";
import { matchPick, type Suggestion, type IndexPlayer, type IndexTeam, type WeekIndex } from "./match";
import { fetchTabCsv, fetchTabNames, parseMemberTab, type SheetPick } from "./sheet";

// Imports every member's picks from the league's Google Sheet into entries and picks, then scores the
// affected weeks. Re-running is safe: unchanged picks are left alone, changed cells replace the pick.
// The sheet is the source of truth for other members; picks are written with the lock bypassed.

type Db = SupabaseClient<Database>;

const LEAGUE_SLUG = "main";
const SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };

export type ImportIssue = {
  member: string;
  week: number;
  slot: string;
  slotKey?: Slot;
  text: string;
  problem: string;
  suggestions?: Suggestion[];
};

/** Records how an unresolved (or wrongly matched) sheet cell should be read. Next import uses it. */
export async function saveImportOverride(
  db: Db,
  o: { year: number; member: string; week: number; slot: Slot; text: string; playerId: number },
): Promise<void> {
  const entry = must(
    await db
      .from("entries")
      .select("id, seasons!inner(year), leagues!inner(slug), profiles!inner(league_members!inner(sheet_tab))")
      .eq("seasons.year", o.year)
      .eq("leagues.slug", LEAGUE_SLUG)
      .eq("profiles.league_members.sheet_tab", o.member)
      .maybeSingle(),
    `find ${o.member}'s entry`,
  );
  ok(
    await db
      .from("pick_import_overrides")
      .upsert({ entry_id: entry.id, week: o.week, slot: o.slot, cell_text: o.text, player_id: o.playerId }, { onConflict: "entry_id,week,slot" }),
    "save override",
  );
}

export type ImportSummary = {
  dryRun: boolean;
  members: number;
  newMembers: string[];
  cells: number;
  matched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Matched, but not by an exact name on the named school. Worth a glance. */
  loose: ImportIssue[];
  /** No player found: fix the sheet cell, add the player, or set his position, then re-run. */
  unresolved: ImportIssue[];
  /** The database refused the pick (e.g. the same player used twice). */
  errors: ImportIssue[];
  /** Imported anyway, but the pick breaks a rule as the app understands it. */
  ruleWarnings: ImportIssue[];
  weeksScored: number[];
  /** Sheet rows without a week number that still had text in them. */
  skippedRows: string[];
};

type Member = { profileId: string; tab: string };

export async function importLeaguePicks(db: Db, year: number, opts: { weeks?: number[]; dryRun?: boolean } = {}): Promise<ImportSummary> {
  const dryRun = opts.dryRun ?? false;
  const league = must(await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single(), "load league");
  const season = must(await db.from("seasons").select("id").eq("year", year).maybeSingle(), `load ${year} season`);
  const config = (await db.from("league_seasons").select("pick_sheet_id").eq("league_id", league.id).eq("season_id", season.id).maybeSingle()).data;
  if (!config?.pick_sheet_id) throw new Error(`No pick sheet set for ${year}.`);
  const sheetId = config.pick_sheet_id;

  // --- Members: one per sheet tab. New tabs become new members. -----------------------------------
  const memberRows = must(
    await db.from("league_members").select("profile_id, sheet_tab").eq("league_id", league.id).not("sheet_tab", "is", null),
    "load members",
  );
  const members: Member[] = memberRows.map((m) => ({ profileId: m.profile_id, tab: m.sheet_tab! }));
  let tabs: string[];
  try {
    tabs = await fetchTabNames(sheetId);
    if (tabs.length === 0) throw new Error("no tabs found");
  } catch {
    tabs = members.map((m) => m.tab); // Google changed the page: fall back to the tabs we know
  }
  const newMembers = tabs.filter((t) => !members.some((m) => m.tab === t));
  for (const tab of newMembers) {
    if (dryRun) {
      members.push({ profileId: `new:${tab}`, tab });
      continue;
    }
    const profile = must(await db.from("profiles").insert({ display_name: tab }).select("id").single(), `add ${tab}`);
    ok(await db.from("league_members").insert({ league_id: league.id, profile_id: profile.id, sheet_tab: tab }), `add ${tab} to league`);
    members.push({ profileId: profile.id, tab });
  }
  const activeMembers = members.filter((m) => tabs.includes(m.tab));

  const entryIds = new Map<string, number>();
  if (!dryRun) {
    ok(
      await db.from("entries").upsert(
        activeMembers.map((m) => ({ league_id: league.id, season_id: season.id, profile_id: m.profileId })),
        { onConflict: "league_id,season_id,profile_id", ignoreDuplicates: true },
      ),
      "create entries",
    );
  }
  const entries = must(await db.from("entries").select("id, profile_id").eq("league_id", league.id).eq("season_id", season.id), "load entries");
  for (const e of entries) entryIds.set(e.profile_id, e.id);

  const summary: ImportSummary = {
    dryRun,
    members: activeMembers.length,
    newMembers,
    skippedRows: [],
    cells: 0,
    matched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    loose: [],
    unresolved: [],
    errors: [],
    ruleWarnings: [],
    weeksScored: [],
  };

  // --- Sheet cells ---------------------------------------------------------------------------------
  const cellsByMember = new Map<string, SheetPick[]>();
  for (const batch of chunks(activeMembers, 6)) {
    await Promise.all(
      batch.map(async (m) => {
        const { picks, skipped } = parseMemberTab(await fetchTabCsv(sheetId, m.tab));
        for (const row of skipped) summary.skippedRows.push(`${m.tab} ${row}`);
        cellsByMember.set(m.tab, opts.weeks ? picks.filter((p) => opts.weeks!.includes(p.week)) : picks);
      }),
    );
  }
  const weeks = [...new Set([...cellsByMember.values()].flat().map((p) => p.week))].sort((a, b) => a - b);

  // --- Reference data for those weeks --------------------------------------------------------------
  const ref = await loadReference(db, season.id, league.id, weeks);
  const overrides = new Map(
    must(
      await db.from("pick_import_overrides").select("entry_id, week, slot, cell_text, player_id").in("entry_id", [...entryIds.values()]),
      "load overrides",
    ).map((o) => [`${o.entry_id}|${o.week}|${o.slot}`, o]),
  );

  // --- Match ---------------------------------------------------------------------------------------
  type Row = { key: string; entry_id: number; week: number; slot: Slot; player_id: number; game_id: number; team_id: number; spread_at_pick: number | null };
  const rows: Row[] = [];
  const issueFor = new Map<string, Omit<ImportIssue, "problem">>();
  const entryPicks = new Map<string, (EntryPick & { game: GameInfo; teamId: number; position: string | null; key: string })[]>();

  for (const m of activeMembers) {
    for (const cell of cellsByMember.get(m.tab) ?? []) {
      summary.cells++;
      const base = { member: m.tab, week: cell.week, slot: SLOT_LABEL[cell.slot], slotKey: cell.slot, text: cell.text };
      const index = ref.weekIndex.get(cell.week);
      if (!index) {
        summary.unresolved.push({ ...base, problem: `No games loaded for week ${cell.week}` });
        continue;
      }
      const override = overrides.get(`${entryIds.get(m.profileId)}|${cell.week}|${cell.slot}`);
      let match: ReturnType<typeof matchPick>;
      if (override && override.cell_text === cell.text) {
        const p = ref.playerById.get(override.player_id);
        match = !p
          ? { ok: false, reason: "The hand-picked player has no roster row this season", suggestions: [] }
          : !ref.gameByTeam.has(`${cell.week}|${p.teamId}`)
            ? { ok: false, reason: `The hand-picked player's team has no game in week ${cell.week}`, suggestions: [] }
            : { ok: true, playerId: p.id, teamId: p.teamId, note: "set by hand" };
      } else {
        match = matchPick(cell.text, cell.slot, index);
      }
      if (!match.ok) {
        summary.unresolved.push({ ...base, problem: `${match.reason}.`, suggestions: match.suggestions });
        continue;
      }
      const game = ref.gameByTeam.get(`${cell.week}|${match.teamId}`)!;
      summary.matched++;
      const player = ref.playerById.get(match.playerId)!;
      if (match.note) summary.loose.push({ ...base, problem: `→ ${player.name} (${match.note})` });

      const key = `${m.tab}|${cell.week}|${cell.slot}`;
      issueFor.set(key, base);
      const spreadHome = game.spreadHome;
      const teamSpread = spreadHome === null ? null : game.home.teamId === match.teamId ? spreadHome : -spreadHome;
      rows.push({
        key,
        entry_id: entryIds.get(m.profileId) ?? -1,
        week: cell.week,
        slot: cell.slot,
        player_id: match.playerId,
        game_id: game.id,
        team_id: match.teamId,
        spread_at_pick: teamSpread,
      });
      const list = entryPicks.get(m.tab) ?? [];
      list.push({
        key,
        week: cell.week,
        slot: cell.slot,
        playerId: match.playerId,
        status: "final",
        teamConferenceId: ref.conferenceOf.get(match.teamId) ?? null,
        lockAt: game.lockAt,
        game,
        teamId: match.teamId,
        position: player.position,
      });
      entryPicks.set(m.tab, list);
    }
  }

  // --- Rule check (informational: the league already accepted these picks) -----------------------
  for (const [, list] of entryPicks) {
    for (const p of list) {
      const others = list.filter((o) => o !== p);
      const violations = validatePick(
        { playerId: p.playerId, teamId: p.teamId, position: p.position, game: p.game },
        { now: new Date(), week: p.week, slot: p.slot, weekRule: ref.weekRules.get(p.week) ?? "standard", entryPicks: others },
      ).filter((v) => !["locked", "slot_locked", "wrong_week", "already_used"].includes(v.code));
      if (violations.length) {
        summary.ruleWarnings.push({ ...issueFor.get(p.key)!, problem: violations.map((v) => v.message).join(" ") });
      }
    }
  }

  if (dryRun) return summary;

  // --- Write, score, and retry refusals once ------------------------------------------------------
  // A player released as DNP in an earlier week can legally be picked again, but until that earlier
  // pick is scored as DNP the single-use index refuses the later one. Scoring then retrying fixes it.
  const write = async (batch: Row[]) => {
    const failed: { row: Row; message: string }[] = [];
    for (const part of chunks(batch, 200)) {
      const result = must(await db.rpc("import_picks", { p_picks: part }), "import picks") as {
        key: string;
        result: "inserted" | "updated" | "unchanged" | "error";
        message?: string;
      }[];
      for (const r of result) {
        if (r.result === "error") failed.push({ row: part.find((p) => p.key === r.key)!, message: r.message ?? "error" });
        else summary[r.result]++;
      }
    }
    return failed;
  };
  const score = async () => {
    for (const week of weeks) {
      const s = await scoreWeek(db, season.id, week);
      for (const f of s.failed) summary.errors.push({ member: "?", week, slot: "", text: "", problem: `scoring ${f}` });
    }
  };

  let failed = await write(rows);
  await score();
  if (failed.length) {
    failed = await write(failed.map((f) => f.row));
    await score();
  }
  for (const f of failed) summary.errors.push({ ...issueFor.get(f.row.key)!, problem: f.message });
  summary.weeksScored = weeks;
  return summary;
}

// ---------------------------------------------------------------------------------------------------

type RefGame = GameInfo;

/** Matches typed text ("Jamal Roberts - Missouri") for one week, the way the import would. */
export async function matchCellText(db: Db, year: number, week: number, slot: Slot, text: string) {
  const league = must(await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single(), "load league");
  const season = must(await db.from("seasons").select("id").eq("year", year).single(), "load season");
  const ref = await loadReference(db, season.id, league.id, [week]);
  const index = ref.weekIndex.get(week);
  if (!index) return { ok: false as const, reason: `No games in week ${week}`, suggestions: [] };
  return matchPick(text, slot, index);
}

async function loadReference(db: Db, seasonId: number, leagueId: number, weeks: number[]) {
  const [games, teams, rosters, rules] = await Promise.all([
    selectAll("load games", (from, to) =>
      db
        .from("games")
        .select("id, week, kickoff_at, start_time_tbd, home_team_id, away_team_id, game_lines(provider, spread_home, source)")
        .eq("season_id", seasonId)
        .eq("season_type", "regular")
        .in("week", weeks)
        .order("id")
        .range(from, to),
    ),
    selectAll("load teams", (from, to) =>
      db.from("team_seasons").select("team_id, classification, conference_id, teams(school, abbreviation)").eq("season_id", seasonId).order("team_id").range(from, to),
    ),
    selectAll("load rosters", (from, to) =>
      db
        .from("player_seasons")
        .select("player_id, team_id, position, position_override, players(name)")
        .eq("season_id", seasonId)
        .order("player_id")
        .range(from, to),
    ),
    db.from("league_weeks").select("week, rule").eq("league_id", leagueId).eq("season_id", seasonId),
  ]);

  const teamInfo = new Map(teams.map((t) => [t.team_id, t]));
  const conferenceOf = new Map(teams.map((t) => [t.team_id, t.conference_id]));
  const side = (teamId: number) => ({
    teamId,
    classification: (teamInfo.get(teamId)?.classification ?? null) as Classification | null,
    conferenceId: teamInfo.get(teamId)?.conference_id ?? null,
  });

  const gameByTeam = new Map<string, RefGame>();
  const teamsByWeek = new Map<number, Set<number>>();
  const gameIdsByWeek = new Map<number, number[]>();
  for (const g of [...games].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))) {
    const info: RefGame = {
      id: g.id,
      week: g.week,
      lockAt: lockAt(new Date(g.kickoff_at), g.start_time_tbd),
      home: side(g.home_team_id),
      away: side(g.away_team_id),
      spreadHome: chooseSpread(g.game_lines.map((l) => ({ provider: l.provider, spreadHome: l.spread_home === null ? null : Number(l.spread_home), source: l.source }))),
    };
    for (const t of [g.home_team_id, g.away_team_id]) {
      if (!gameByTeam.has(`${g.week}|${t}`)) gameByTeam.set(`${g.week}|${t}`, info);
      const set = teamsByWeek.get(g.week) ?? new Set();
      set.add(t);
      teamsByWeek.set(g.week, set);
    }
    gameIdsByWeek.set(g.week, [...(gameIdsByWeek.get(g.week) ?? []), g.id]);
  }

  const players: IndexPlayer[] = rosters.map((r) => ({
    id: r.player_id,
    name: r.players.name,
    teamId: r.team_id,
    position: r.position_override ?? r.position,
  }));
  const playerById = new Map(players.map((p) => [p.id, p]));

  const weekIndex = new Map<number, WeekIndex>();
  for (const week of weeks) {
    const teamIds = teamsByWeek.get(week);
    if (!teamIds) continue;
    const gameIds = gameIdsByWeek.get(week) ?? [];
    const withStats = new Set<number>();
    for (const part of chunks(gameIds, 150)) {
      const stats = await selectAll("load stat players", (from, to) =>
        db.from("player_game_stats").select("player_id").in("game_id", part).order("player_id").range(from, to),
      );
      for (const s of stats) withStats.add(s.player_id);
    }
    const indexTeams: IndexTeam[] = [...teamIds].map((id) => ({
      id,
      school: teamInfo.get(id)?.teams.school ?? "?",
      abbreviation: teamInfo.get(id)?.teams.abbreviation ?? null,
    }));
    weekIndex.set(week, { teams: indexTeams, players: players.filter((p) => teamIds.has(p.teamId)), withStats });
  }

  const weekRules = new Map((rules.data ?? []).map((r) => [r.week, r.rule as WeekRule]));
  return { weekIndex, gameByTeam, playerById, conferenceOf, weekRules };
}

/** Runs the import and logs it in sync_runs (kind "import"); the summary is the full report. Never throws. */
export async function runImport(db: Db, year: number, weeks?: number[]): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const run = must(
    await db.from("sync_runs").insert({ kind: "import", season_year: year, week: weeks?.length === 1 ? weeks[0] : null }).select("id").single(),
    "start import run",
  );
  try {
    const summary = await importLeaguePicks(db, year, { weeks });
    await db.from("sync_runs").update({ status: "ok", finished_at: new Date().toISOString(), summary }).eq("id", run.id);
    return { ok: true, summary };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error }).eq("id", run.id);
    return { ok: false, error };
  }
}
