import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { seasonYearFor } from "@/lib/cfbd";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_SYNC_KINDS } from "@/lib/sync/run";
import { ReviewButtons } from "./review-item";
import { SyncPanel } from "./sync-panel";

const SLOT_LABEL = { QB: "QB", RB: "RB", WRTE: "WR/TE" } as const;

// /admin is behind the password prompt in src/proxy.ts.
export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <AdminContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const formatTime = (iso: string | null) => (iso ? `${timeFormat.format(new Date(iso))} ET` : "—");

async function AdminContent({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const currentYear = seasonYearFor(new Date());
  const year = Number(params.season) || currentYear;
  const db = createAdminClient();

  const season = (await db.from("seasons").select("id").eq("year", year).maybeSingle()).data;
  const seasonId = season?.id ?? -1;
  const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;

  const [fbsTeams, fcsTeams, games, completed, players, lines, runsResult, quotaResult, reviewResult, { weeks, current }] = await Promise.all([
    count(db.from("team_seasons").select("*", { count: "exact", head: true }).eq("season_id", seasonId).eq("classification", "fbs")),
    count(db.from("team_seasons").select("*", { count: "exact", head: true }).eq("season_id", seasonId).eq("classification", "fcs")),
    count(db.from("games").select("*", { count: "exact", head: true }).eq("season_id", seasonId)),
    count(db.from("games").select("*", { count: "exact", head: true }).eq("season_id", seasonId).eq("completed", true)),
    count(db.from("player_seasons").select("*", { count: "exact", head: true }).eq("season_id", seasonId)),
    count(
      db
        .from("game_lines")
        .select("game_id, games!inner(season_id)", { count: "exact", head: true })
        .eq("games.season_id", seasonId),
    ),
    db
      .from("sync_runs")
      .select("kind, week, status, finished_at, started_at, summary, error")
      .eq("season_year", year)
      .order("started_at", { ascending: false })
      .limit(40),
    db
      .from("sync_runs")
      .select("cfbd_calls_remaining, finished_at")
      .not("cfbd_calls_remaining", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("picks")
      .select("id, week, slot, review_reason, players(name), teams(school), entries!inner(season_id, profiles(display_name))")
      .eq("entries.season_id", seasonId)
      .not("review_reason", "is", null)
      .order("week"),
    seasonWeeks(year, new Date()),
  ]);

  const runs = runsResult.data ?? [];
  const lastRun = Object.fromEntries(ALL_SYNC_KINDS.map((kind) => [kind, runs.find((r) => r.kind === kind) ?? null]));
  const reviews = reviewResult.data ?? [];
  const quota = quotaResult.data;

  const stats = [
    { label: "FBS teams", value: fbsTeams },
    { label: "FCS teams", value: fcsTeams },
    { label: "Games", value: `${games} (${completed} final)` },
    { label: "Skill players", value: players },
    { label: "Lines", value: lines },
  ];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">
            {year} season ·{" "}
            {quota
              ? `${quota.cfbd_calls_remaining} CFBD calls left this month (as of ${formatTime(quota.finished_at)})`
              : "CFBD quota unknown until the first sync"}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          {[currentYear, currentYear + 1].map((y) => (
            <Link
              key={y}
              href={`/admin?season=${y}`}
              className={y === year ? "font-semibold underline underline-offset-4" : "text-muted-foreground hover:underline"}
            >
              {y}
            </Link>
          ))}
        </nav>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Data in the database</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-sm text-muted-foreground">{s.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Needs review {reviews.length > 0 && <Badge variant="destructive">{reviews.length}</Badge>}</CardTitle>
          <CardDescription>
            Picked players with no box-score line. They count as used with 0 points until you decide. &ldquo;Didn&apos;t
            play&rdquo; (zero snaps) releases them to be picked again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">
                      {r.players.name} <span className="text-muted-foreground">· {r.teams.school}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Week {r.week} {SLOT_LABEL[r.slot]} · {r.entries.profiles.display_name}
                    </div>
                  </div>
                  <ReviewButtons pickId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync from CollegeFootballData</CardTitle>
          <CardDescription>Re-running is safe: rows are updated in place, and hand-entered data is never overwritten.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <SyncPanel season={year} weeks={weeks} currentWeek={current} />
          <div className="flex flex-col divide-y text-sm">
            {ALL_SYNC_KINDS.map((kind) => {
              const run = lastRun[kind];
              return (
                <div key={kind} className="flex items-start justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="font-medium capitalize">
                      {kind}
                      {kind === "results" && run?.week != null && <span className="font-normal text-muted-foreground"> · week {run.week}</span>}
                    </div>
                    <div className="break-words text-muted-foreground">
                      {!run
                        ? "Never synced"
                        : run.status === "error"
                          ? run.error
                          : formatTime(run.finished_at ?? run.started_at)}
                    </div>
                  </div>
                  {run && (
                    <Badge variant={run.status === "ok" ? "secondary" : run.status === "error" ? "destructive" : "outline"}>
                      {run.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
