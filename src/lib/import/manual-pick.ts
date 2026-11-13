import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreWeek } from "@/lib/picks/scoring";
import { chooseSpread, type Slot } from "@/lib/rules";
import type { Database } from "@/lib/supabase/database.types";
import { must, ok } from "@/lib/supabase/helpers";
import { matchCellText, runImport } from "./league-import";
import { fetchTabCsv, parseMemberTab } from "./sheet";

// Changing any member's pick by hand (e.g. a swap announced by email after the sheet went out).
// The pick is written straight away; if the sheet has text in that cell, a per-cell override is saved
// too, so later imports keep the change unless someone edits that cell in the sheet.

type Db = SupabaseClient<Database>;

async function loadEntry(db: Db, entryId: number) {
  const entry = must(
    await db.from("entries").select("id, league_id, profile_id, season_id, seasons(year)").eq("id", entryId).maybeSingle(),
    "load entry",
  );
  const member = (
    await db.from("league_members").select("sheet_tab").eq("league_id", entry.league_id).eq("profile_id", entry.profile_id).maybeSingle()
  ).data;
  const sheet = (
    await db.from("league_seasons").select("pick_sheet_id").eq("league_id", entry.league_id).eq("season_id", entry.season_id).maybeSingle()
  ).data;
  return { ...entry, year: entry.seasons.year, tab: member?.sheet_tab ?? null, sheetId: sheet?.pick_sheet_id ?? null };
}

/** What the member's sheet tab currently says for that week and slot (null if blank or no tab). */
async function sheetCell(sheetId: string | null, tab: string | null, week: number, slot: Slot): Promise<string | null> {
  if (!sheetId || !tab) return null;
  const { picks } = parseMemberTab(await fetchTabCsv(sheetId, tab));
  return picks.find((p) => p.week === week && p.slot === slot)?.text ?? null;
}

export async function changePick(db: Db, entryId: number, week: number, slot: Slot, typed: string): Promise<string> {
  const entry = await loadEntry(db, entryId);
  const match = await matchCellText(db, entry.year, week, slot, typed);
  if (!match.ok) {
    const hint = match.suggestions.length ? ` Closest: ${match.suggestions.map((s) => s.label).join(", ")}.` : "";
    throw new Error(`${match.reason}.${hint}`);
  }

  const game = must(
    await db
      .from("games")
      .select("id, home_team_id, game_lines(provider, spread_home, source)")
      .eq("season_id", entry.season_id)
      .eq("week", week)
      .or(`home_team_id.eq.${match.teamId},away_team_id.eq.${match.teamId}`)
      .order("kickoff_at")
      .limit(1)
      .maybeSingle(),
    "find his game",
  );
  const spreadHome = chooseSpread(game.game_lines.map((l) => ({ provider: l.provider, spreadHome: l.spread_home === null ? null : Number(l.spread_home), source: l.source })));
  const teamSpread = spreadHome === null ? null : game.home_team_id === match.teamId ? spreadHome : -spreadHome;

  const cell = await sheetCell(entry.sheetId, entry.tab, week, slot);
  if (cell) {
    ok(
      await db
        .from("pick_import_overrides")
        .upsert({ entry_id: entryId, week, slot, cell_text: cell, player_id: match.playerId }, { onConflict: "entry_id,week,slot" }),
      "save override",
    );
  }

  const result = must(
    await db.rpc("import_picks", {
      p_picks: [
        { key: "manual", entry_id: entryId, week, slot, player_id: match.playerId, game_id: game.id, team_id: match.teamId, spread_at_pick: teamSpread, entered_via: "admin" },
      ],
      p_force: true, // an admin correction wins over a member's own app pick
    }),
    "save pick",
  ) as { result: string; message?: string }[];
  if (result[0]?.result === "error") throw new Error(result[0].message ?? "The database refused the pick.");

  const score = await scoreWeek(db, entry.season_id, week);
  if (score.failed.length) throw new Error(`Saved, but scoring failed: ${score.failed.join("; ")}`);
  return cell
    ? `Saved. Future imports keep this while the sheet still says "${cell}".`
    : "Saved. The sheet has nothing in that cell, so imports leave this pick alone.";
}

/** Drops the hand change and re-imports the week, so the sheet's cell applies again. */
export async function undoPickChange(db: Db, entryId: number, week: number, slot: Slot): Promise<string> {
  const entry = await loadEntry(db, entryId);
  ok(await db.from("pick_import_overrides").delete().eq("entry_id", entryId).eq("week", week).eq("slot", slot), "remove override");
  const result = await runImport(db, entry.year, [week]);
  if (!result.ok) throw new Error(result.error);
  return `Back to what the sheet says; week ${week} re-imported.`;
}
