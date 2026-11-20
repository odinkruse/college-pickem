import "server-only";
import { cacheLife } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/helpers";

export type TeamOption = { id: number; school: string; division: "FBS" | "FCS" };

/** FBS and FCS schools for a season, FBS first, for favorite-team pickers. Changes once a season. */
export async function loadTeamOptions(year: number): Promise<TeamOption[]> {
  "use cache";
  cacheLife("days");
  const rows = await selectAll("load teams", (from, to) =>
    createAdminClient()
      .from("team_seasons")
      .select("classification, teams!inner(id, school), seasons!inner(year)")
      .eq("seasons.year", year)
      .in("classification", ["fbs", "fcs"])
      .order("team_id")
      .range(from, to),
  );
  return rows
    .map((r) => ({ id: r.teams.id, school: r.teams.school, division: r.classification === "fbs" ? ("FBS" as const) : ("FCS" as const) }))
    .sort((a, b) => a.division.localeCompare(b.division) || a.school.localeCompare(b.school));
}

/** A typed school name → team id (case-insensitive, exact school name). */
export function findTeam(options: TeamOption[], school: string): TeamOption | undefined {
  const wanted = school.trim().toLowerCase();
  return options.find((t) => t.school.toLowerCase() === wanted);
}
