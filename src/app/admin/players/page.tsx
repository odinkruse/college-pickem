import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OVERRIDE_POSITIONS } from "@/lib/admin/forms";
import { seasonYearFor } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { addPlayerAction, setOverrideAction } from "../override-actions";

const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Find a player to fix his position, list players with no position, or add one CFBD doesn't have.
export default function PlayersPage(props: PageProps<"/admin/players">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/players" />
      <Suspense fallback={<p className="text-muted-foreground">Loading players…</p>}>
        <Players searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/admin/players">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const q = String(params.q ?? "").trim().slice(0, 60);
  const noPosition = params.nopos === "1";
  const year = seasonYearFor(new Date());

  const db = createAdminClient();
  const season = must(await db.from("seasons").select("id").eq("year", year).single(), "load season");

  const fields = "player_id, position, position_override, jersey, teams(school), players!inner(name, source, cfbd_id)";
  const [results, teams] = await Promise.all([
    noPosition
      ? db.from("player_seasons").select(fields).eq("season_id", season.id).is("position", null).is("position_override", null).limit(200)
      : q.length >= 2
        ? db.from("player_seasons").select(fields).eq("season_id", season.id).ilike("players.name", `%${escapeLike(q)}%`).limit(50)
        : Promise.resolve({ data: [], error: null }),
    db
      .from("team_seasons")
      .select("team_id, teams(school)")
      .eq("season_id", season.id)
      .in("classification", ["fbs", "fcs"]),
  ]);
  const players = must(results, "search players").sort((a, b) => a.players.name.localeCompare(b.players.name));
  const teamOptions = must(teams, "load teams").sort((a, b) => a.teams.school.localeCompare(b.teams.school));

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Players</h1>
        <p className="text-sm text-muted-foreground">
          {year} season · positions decide which slot a player can fill (QB · RB/FB · WR/TE). An override survives roster syncs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Find a player</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder="Name" className="w-56" />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
            <Link href="/admin/players?nopos=1" className="text-sm text-muted-foreground underline underline-offset-4">
              Players with no position
            </Link>
          </form>

          {(q.length >= 2 || noPosition) && players.length === 0 && <p className="text-sm text-muted-foreground">No players found.</p>}
          {noPosition && players.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {players.length} players with no position (CFBD left it blank, or they turned up in a box score but not on a roster). They
              can&apos;t be picked until they have one.
            </p>
          )}
          <ul className="flex flex-col divide-y">
            {players.map((p) => (
              <li key={p.player_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{p.players.name}</span>
                  {p.jersey !== null && <span className="text-muted-foreground"> #{p.jersey}</span>}
                  {p.players.source === "manual" && (
                    <Badge variant="secondary" className="ml-1.5">
                      added by hand
                    </Badge>
                  )}
                  <div className="text-muted-foreground">
                    {p.teams.school} · roster position {p.position ?? "none"}
                  </div>
                </div>
                <ActionForm action={setOverrideAction} className="flex items-center gap-2">
                  <input type="hidden" name="player" value={p.player_id} />
                  <input type="hidden" name="season" value={season.id} />
                  <select name="position" aria-label="Position override" defaultValue={p.position_override ?? ""} className={selectClass}>
                    <option value="">No override</option>
                    {OVERRIDE_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="outline">
                    Save
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a player</CardTitle>
          <CardDescription>
            For someone CFBD doesn&apos;t list at all. Search first: players in box scores are created automatically and only need a position.
            Stats for a hand-added player are entered by hand on the game page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addPlayerAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="season" value={season.id} />
            <Input name="name" placeholder="First Last" aria-label="Name" className="w-48" required />
            <select name="team" aria-label="Team" required defaultValue="" className={`${selectClass} max-w-56`}>
              <option value="" disabled>
                Team…
              </option>
              {teamOptions.map((t) => (
                <option key={t.team_id} value={t.team_id}>
                  {t.teams.school}
                </option>
              ))}
            </select>
            <select name="position" aria-label="Position" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Position…
              </option>
              {OVERRIDE_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
            <Input name="jersey" type="number" min={0} max={99} placeholder="#" aria-label="Jersey" className="w-16" />
            <Button type="submit" size="sm">
              Add player
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
