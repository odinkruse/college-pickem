import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STAT_FIELDS } from "@/lib/admin/forms";
import { MANUAL_PROVIDER } from "@/lib/admin/overrides";
import { parseRules } from "@/lib/picks/scoring";
import { chooseSpread, scoreStatLine, type ScoringRules } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../../action-form";
import { AdminNav } from "../../admin-nav";
import { describeLine, describeStats, formatKickoff } from "../../format";
import { saveLineAction, saveStatsAction } from "../../override-actions";

const SLOT_LABEL = { QB: "QB", RB: "RB", WRTE: "WR/TE" } as const;
const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

// One game: its lines (set one by hand), the picks on it, and its box score (fix or add stat lines).
// ?player=<id> opens the stat editor for that player.
export default function GamePage(props: PageProps<"/admin/games/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/games" />
      <Suspense fallback={<p className="text-muted-foreground">Loading game…</p>}>
        <GameDetail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type StatRow = {
  pass_yds: number;
  pass_td: number;
  interceptions: number;
  rush_yds: number;
  rush_td: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
};

const points = (s: StatRow, rules: ScoringRules) =>
  scoreStatLine(
    {
      passYds: s.pass_yds,
      passTd: s.pass_td,
      interceptions: s.interceptions,
      rushYds: s.rush_yds,
      rushTd: s.rush_td,
      recYds: s.rec_yds,
      recTd: s.rec_td,
      fumblesLost: s.fumbles_lost,
    },
    rules,
  );

async function GameDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/games/[id]">["params"];
  searchParams: PageProps<"/admin/games/[id]">["searchParams"];
}) {
  await connection();
  const gameId = Number((await params).id);
  const editPlayerId = Number((await searchParams).player) || null;
  if (!Number.isInteger(gameId)) notFound();

  const db = createAdminClient();
  const game = (
    await db
      .from("games")
      .select(
        `id, season_id, week, kickoff_at, start_time_tbd, completed, home_points, away_points,
         home:teams!games_home_team_id_fkey(id, school), away:teams!games_away_team_id_fkey(id, school),
         game_lines(provider, spread_home, source, fetched_at), seasons(year, scoring_rules)`,
      )
      .eq("id", gameId)
      .maybeSingle()
  ).data;
  if (!game) notFound();

  const [statsResult, picksResult, rosterResult] = await Promise.all([
    db
      .from("player_game_stats")
      .select("*, players(name, player_seasons(season_id, position, position_override))")
      .eq("game_id", gameId),
    db
      .from("picks")
      .select("id, slot, status, points, review_reason, player_id, players(name), entries(profiles(display_name))")
      .eq("game_id", gameId),
    db
      .from("player_seasons")
      .select("player_id, team_id, position, position_override, players(name)")
      .eq("season_id", game.season_id)
      .in("team_id", [game.home.id, game.away.id]),
  ]);
  const stats = must(statsResult, "load stats");
  const picks = must(picksResult, "load picks");
  const roster = must(rosterResult, "load rosters").sort((a, b) => a.team_id - b.team_id || a.players.name.localeCompare(b.players.name));

  const rules = parseRules(game.seasons.scoring_rules);
  const school = (teamId: number) => (teamId === game.home.id ? game.home.school : game.away.school);
  const positionOf = (p: { player_seasons: { season_id: number; position: string | null; position_override: string | null }[] }) => {
    const ps = p.player_seasons.find((s) => s.season_id === game.season_id);
    return ps?.position_override ?? ps?.position ?? "?";
  };
  const pickedIds = new Set(picks.map((p) => p.player_id));

  const lines = game.game_lines.map((l) => ({ provider: l.provider, spreadHome: l.spread_home === null ? null : Number(l.spread_home), source: l.source }));
  const used = chooseSpread(lines);
  const manual = lines.find((l) => l.provider === MANUAL_PROVIDER);

  return (
    <>
      <header>
        <Link href={`/admin/games?week=${game.week}`} className="text-sm text-muted-foreground hover:underline">
          ← Week {game.week} games
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {game.away.school} @ {game.home.school}
        </h1>
        <p className="text-sm text-muted-foreground">
          {game.completed ? `Final: ${game.away.school} ${game.away_points}, ${game.home.school} ${game.home_points}` : formatKickoff(game.kickoff_at, game.start_time_tbd)}
        </p>
      </header>

      {editPlayerId && (
        <StatEditor
          gameId={gameId}
          playerId={editPlayerId}
          stat={stats.find((s) => s.player_id === editPlayerId) ?? null}
          rosterRow={roster.find((r) => r.player_id === editPlayerId) ?? null}
          school={school}
          rules={rules}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Line</CardTitle>
          <CardDescription>
            Counts for Underdog week: <span className="font-medium text-foreground">{describeLine(used, game.home.school, game.away.school)}</span>. A
            manual line beats every CFBD provider and is never overwritten by sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {lines.length > 0 && (
            <ul className="text-sm">
              {lines.map((l) => (
                <li key={l.provider} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{l.provider}</span>
                  <span>{describeLine(l.spreadHome, game.home.school, game.away.school)}</span>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={saveLineAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="game" value={gameId} />
            <select
              name="favorite"
              aria-label="Favorite"
              defaultValue={manual?.spreadHome == null ? "home" : manual.spreadHome < 0 ? "home" : manual.spreadHome > 0 ? "away" : "pickem"}
              className={selectClass}
            >
              <option value="home">{game.home.school} favored</option>
              <option value="away">{game.away.school} favored</option>
              <option value="pickem">Pick&apos;em</option>
            </select>
            <span className="text-sm">by</span>
            <Input
              name="points"
              aria-label="Points"
              inputMode="decimal"
              placeholder="3.5"
              defaultValue={manual?.spreadHome ? Math.abs(manual.spreadHome) : ""}
              className="w-20"
            />
            <Button type="submit" size="sm" name="op" value="save">
              {manual ? "Update manual line" : "Set manual line"}
            </Button>
            {manual && (
              <Button type="submit" size="sm" variant="ghost" name="op" value="clear">
                Remove manual line
              </Button>
            )}
          </ActionForm>
        </CardContent>
      </Card>

      {picks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Picks on this game</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {picks.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{p.players.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {SLOT_LABEL[p.slot]} · {p.entries.profiles.display_name}
                  </span>
                  {p.review_reason && <div className="text-amber-600 dark:text-amber-400">Under review</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{p.status === "final" ? `${p.points} pts` : p.status}</Badge>
                  <Link href={`/admin/games/${gameId}?player=${p.player_id}`} className="underline underline-offset-4">
                    Edit stats
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Box score</CardTitle>
          <CardDescription>
            Skill-position stat lines. Editing one makes it manual: the results sync keeps it from then on, and the week is rescored straight away.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* GET form: choosing a player just adds ?player= to the URL, which opens the editor above. */}
          <form className="flex flex-wrap items-center gap-2">
            <select name="player" aria-label="Player" className={`${selectClass} max-w-full`} required defaultValue="">
              <option value="" disabled>
                Add or edit a player&apos;s line…
              </option>
              {[game.away, game.home].map((t) => (
                <optgroup key={t.id} label={t.school}>
                  {roster
                    .filter((r) => r.team_id === t.id)
                    .map((r) => (
                      <option key={r.player_id} value={r.player_id}>
                        {r.players.name} ({r.position_override ?? r.position ?? "?"})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Open
            </Button>
          </form>
          {stats.length === 0 && <p className="text-sm text-muted-foreground">No stat lines yet. Run the results sync for week {game.week}.</p>}
          {[game.away, game.home].map((t) => {
            const teamStats = stats
              .filter((s) => s.team_id === t.id)
              .sort((a, b) => points(b, rules) - points(a, rules) || a.players.name.localeCompare(b.players.name));
            if (teamStats.length === 0) return null;
            return (
              <section key={t.id}>
                <h3 className="mb-1 text-sm font-semibold">{t.school}</h3>
                <ul className="flex flex-col divide-y text-sm">
                  {teamStats.map((s) => (
                    <li key={s.player_id} className="flex items-start justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <span className="font-medium">{s.players.name}</span>{" "}
                        <span className="text-muted-foreground">{positionOf(s.players)}</span>
                        {s.source === "manual" && (
                          <Badge variant="secondary" className="ml-1.5">
                            manual
                          </Badge>
                        )}
                        {pickedIds.has(s.player_id) && (
                          <Badge variant="outline" className="ml-1.5">
                            picked
                          </Badge>
                        )}
                        <div className="text-muted-foreground">
                          {s.appeared ? describeStats(s) : "Did not play"}
                          {s.note && <> · {s.note}</>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular-nums">{s.appeared ? points(s, rules) : "–"}</span>
                        <Link href={`/admin/games/${gameId}?player=${s.player_id}`} className="underline underline-offset-4">
                          Edit
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function StatEditor({
  gameId,
  playerId,
  stat,
  rosterRow,
  school,
  rules,
}: {
  gameId: number;
  playerId: number;
  stat: (StatRow & { appeared: boolean; source: string; note: string | null; team_id: number; players: { name: string } }) | null;
  rosterRow: { team_id: number; position: string | null; position_override: string | null; players: { name: string } } | null;
  school: (teamId: number) => string;
  rules: ScoringRules;
}) {
  const name = stat?.players.name ?? rosterRow?.players.name;
  const teamId = stat?.team_id ?? rosterRow?.team_id;
  if (!name || !teamId) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">That player isn&apos;t on either team&apos;s roster this season.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ring-2 ring-primary/30">
      <CardHeader>
        <CardTitle>
          {name} <span className="font-normal text-muted-foreground">· {school(teamId)}</span>
        </CardTitle>
        <CardDescription>
          {stat
            ? stat.source === "manual"
              ? "Hand-entered line."
              : `CFBD line (${stat.appeared ? `${points(stat, rules)} pts` : "did not play"}). Saving makes it manual.`
            : "No stat line for this game yet."}{" "}
          Untick &ldquo;Played&rdquo; for zero snaps: that releases a picked player.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* key: remount with fresh defaults when switching players */}
        <ActionForm key={playerId} action={saveStatsAction} className="flex flex-col gap-3">
          <input type="hidden" name="game" value={gameId} />
          <input type="hidden" name="player" value={playerId} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STAT_FIELDS.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {f.label}
                <Input name={f.name} type="number" min={f.min} max={f.max} step={1} defaultValue={stat?.[f.name] ?? 0} />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="appeared" defaultChecked={stat?.appeared ?? true} /> Played (at least one snap)
          </label>
          <Input name="note" placeholder="Note (optional), e.g. source of the correction" defaultValue={stat?.note ?? ""} maxLength={200} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" name="op" value="save">
              Save stat line
            </Button>
            {stat?.source === "manual" && (
              <Button type="submit" size="sm" variant="ghost" name="op" value="remove" title="The CFBD line returns on the next results sync">
                Remove manual line
              </Button>
            )}
            <Link href={`/admin/games/${gameId}`} className="self-center text-sm text-muted-foreground hover:underline">
              Close
            </Link>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
