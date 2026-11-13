import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lockAt, type Slot } from "@/lib/rules";
import type { Database } from "@/lib/supabase/database.types";
import { must, selectAll } from "@/lib/supabase/helpers";

// League standings: every entry's points by slot and by week. Points exist only on scored picks
// (final / did not play), so unplayed picks never leak anything here.

type Db = SupabaseClient<Database>;
const LEAGUE_SLUG = "main";

export type StandingsRow = {
  entryId: number;
  name: string;
  rank: number;
  total: number;
  bySlot: Record<Slot, number>;
  byWeek: Map<number, number>;
};

export async function loadStandings(db: Db, year: number): Promise<{ rows: StandingsRow[]; weeks: number[] }> {
  const entries = must(
    await db
      .from("entries")
      .select("id, profiles(display_name), leagues!inner(slug), seasons!inner(year)")
      .eq("leagues.slug", LEAGUE_SLUG)
      .eq("seasons.year", year),
    "load entries",
  );
  const picks = await selectAll("load picks", (from, to) =>
    db
      .from("picks")
      .select("entry_id, week, slot, points")
      .in("entry_id", entries.map((e) => e.id))
      .not("points", "is", null)
      .order("id")
      .range(from, to),
  );

  const rows: StandingsRow[] = entries.map((e) => {
    const mine = picks.filter((p) => p.entry_id === e.id);
    const bySlot: Record<Slot, number> = { QB: 0, RB: 0, WRTE: 0 };
    const byWeek = new Map<number, number>();
    for (const p of mine) {
      bySlot[p.slot] += p.points!;
      byWeek.set(p.week, (byWeek.get(p.week) ?? 0) + p.points!);
    }
    return { entryId: e.id, name: e.profiles.display_name, rank: 0, total: bySlot.QB + bySlot.RB + bySlot.WRTE, bySlot, byWeek };
  });

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1));
  const weeks = [...new Set(picks.map((p) => p.week))].sort((a, b) => a - b);
  return { rows, weeks };
}

export type EntryPickView = {
  week: number;
  slot: Slot;
  /** null while the pick's game hasn't kicked off: other people's picks stay hidden until then. */
  player: { name: string; school: string; opponent: string; home: boolean } | null;
  status: string;
  points: number | null;
};

export async function loadEntryPicks(db: Db, entryId: number, now: Date) {
  const entry = (await db.from("entries").select("id, profiles(display_name), seasons(year)").eq("id", entryId).maybeSingle()).data;
  if (!entry) return null;
  const picks = must(
    await db
      .from("picks")
      .select(
        `week, slot, status, points, team_id, players(name), teams(school),
         games(kickoff_at, start_time_tbd, home_team_id, home:teams!games_home_team_id_fkey(school), away:teams!games_away_team_id_fkey(school))`,
      )
      .eq("entry_id", entryId)
      .order("week"),
    "load picks",
  );
  const view: EntryPickView[] = picks.map((p) => {
    const visible = now >= lockAt(new Date(p.games.kickoff_at), p.games.start_time_tbd);
    const home = p.games.home_team_id === p.team_id;
    return {
      week: p.week,
      slot: p.slot,
      status: p.status,
      points: p.points,
      player: visible ? { name: p.players.name, school: p.teams.school, opponent: home ? p.games.away.school : p.games.home.school, home } : null,
    };
  });
  return { name: entry.profiles.display_name, year: entry.seasons.year, picks: view };
}
