import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Slot } from "@/lib/rules";
import type { Database } from "@/lib/supabase/database.types";
import { must, selectAll } from "@/lib/supabase/helpers";
import { fetchTabCsv, fetchTabNames, parseScoringTab, type SheetLine } from "./sheet";

// Compares the app's points with the league's hand-kept scoring sheet ("CFB Fantasy Scoring <year>"):
// one tab per week ("Week 7 - Conference Week"), a row per member, and per slot the columns
// Passing | Rushing | Receiving | TD | Turnover | Points (yards raw, as typed).

type Db = SupabaseClient<Database>;
const SLOTS: Slot[] = ["QB", "RB", "WRTE"];

export type Discrepancy = {
  member: string;
  week: number;
  slot: Slot;
  player: string | null;
  /** For a link to the game page's stat editor. */
  gameId: number | null;
  playerId: number | null;
  appPoints: number | null;
  sheetPoints: number | null;
  app: Omit<SheetLine, "points"> | null;
  sheet: Omit<SheetLine, "points"> | null;
  /** What kind of difference: stats differ, or one side has nothing. */
  kind: "points" | "no_app_score" | "not_in_sheet";
};

export async function compareWithScoringSheet(db: Db, year: number) {
  const config = must(
    await db.from("league_seasons").select("scoring_sheet_id, seasons!inner(year), leagues!inner(slug)").eq("seasons.year", year).eq("leagues.slug", "main").maybeSingle(),
    "load league season",
  );
  if (!config.scoring_sheet_id) throw new Error(`No scoring sheet set for ${year}.`);
  const sheetId = config.scoring_sheet_id;

  const weekTabs = (await fetchTabNames(sheetId)).flatMap((t) => {
    const m = /^Week (\d+)\b/.exec(t.trim());
    return m ? [{ tab: t, week: Number(m[1]) }] : [];
  });
  const sheet = new Map<number, Map<string, Partial<Record<Slot, SheetLine>>>>();
  await Promise.all(weekTabs.map(async ({ tab, week }) => sheet.set(week, parseScoringTab(await fetchTabCsv(sheetId, tab)))));

  const picks = await selectAll("load picks", (from, to) =>
    db
      .from("picks")
      .select("week, slot, status, points, player_id, game_id, players(name), entries!inner(seasons!inner(year), profiles(display_name))")
      .eq("entries.seasons.year", year)
      .order("id")
      .range(from, to),
  );
  const stats = new Map<string, Database["public"]["Tables"]["player_game_stats"]["Row"]>();
  for (let i = 0; i < picks.length; i += 150) {
    const part = picks.slice(i, i + 150);
    const rows = must(
      await db
        .from("player_game_stats")
        .select("*")
        .in("player_id", [...new Set(part.map((p) => p.player_id))])
        .in("game_id", [...new Set(part.map((p) => p.game_id))]),
      "load stats",
    );
    for (const s of rows) stats.set(`${s.player_id}|${s.game_id}`, s);
  }

  const out: Discrepancy[] = [];
  let compared = 0;
  const seen = new Set<string>();
  for (const p of picks) {
    const member = p.entries.profiles.display_name;
    seen.add(`${member}|${p.week}|${p.slot}`);
    const weekSheet = sheet.get(p.week);
    if (!weekSheet) continue; // no tab for that week yet
    const line = weekSheet.get(member)?.[p.slot] ?? null;
    if (p.points === null && !line) continue; // not played yet on either side
    compared++;
    const s = stats.get(`${p.player_id}|${p.game_id}`);
    const app = s ? { pass: s.pass_yds, rush: s.rush_yds, rec: s.rec_yds, td: s.pass_td + s.rush_td + s.rec_td, to: s.interceptions + s.fumbles_lost } : null;
    const sheetPoints = line?.points ?? null;
    if (p.points !== null && sheetPoints !== null && p.points === sheetPoints) continue;
    if (p.points === 0 && sheetPoints === null) continue; // DNP / no stats, and the sheet left it blank
    out.push({
      member,
      week: p.week,
      slot: p.slot,
      player: p.players.name,
      gameId: p.game_id,
      playerId: p.player_id,
      appPoints: p.points,
      sheetPoints,
      app,
      sheet: line ? { pass: line.pass, rush: line.rush, rec: line.rec, td: line.td, to: line.to } : null,
      kind: p.points === null ? "no_app_score" : sheetPoints === null ? "not_in_sheet" : "points",
    });
  }
  // Sheet lines with points for a member/week/slot the app has no pick for.
  for (const [week, members] of sheet) {
    for (const [member, lines] of members) {
      for (const slot of SLOTS) {
        const line = lines[slot];
        if (!line || line.points === 0 || seen.has(`${member}|${week}|${slot}`)) continue;
        out.push({ member, week, slot, player: null, gameId: null, playerId: null, appPoints: null, sheetPoints: line.points, app: null, sheet: { ...line }, kind: "no_app_score" });
      }
    }
  }
  out.sort((a, b) => a.week - b.week || a.member.localeCompare(b.member) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const scoredWeeks = [...sheet].filter(([, members]) => [...members.values()].some((l) => Object.keys(l).length)).map(([w]) => w);
  return { compared, discrepancies: out, weeks: scoredWeeks.sort((a, b) => a - b) };
}
