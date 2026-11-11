import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MANUAL_PROVIDER } from "@/lib/admin/overrides";
import { seasonYearFor } from "@/lib/cfbd";
import { chooseSpread } from "@/lib/rules";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { AdminNav } from "../admin-nav";
import { describeLine, formatKickoff } from "../format";

// One week's games with the line that counts for each. Click through to set a line by hand or fix stats.
export default function GamesPage(props: PageProps<"/admin/games">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/games" />
      <Suspense fallback={<p className="text-muted-foreground">Loading games…</p>}>
        <WeekGames searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function WeekGames({ searchParams }: { searchParams: PageProps<"/admin/games">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const now = new Date();
  const year = seasonYearFor(now);
  const { weeks, current } = await seasonWeeks(year, now);
  const week = weeks.includes(Number(params.week)) ? Number(params.week) : current;
  const q = String(params.q ?? "").trim().toLowerCase();
  const missingOnly = params.missing === "1";

  const db = createAdminClient();
  const season = must(await db.from("seasons").select("id").eq("year", year).single(), "load season");
  const rows = must(
    await db
      .from("games")
      .select(
        `id, kickoff_at, start_time_tbd, completed, home_points, away_points,
         home:teams!games_home_team_id_fkey(school), away:teams!games_away_team_id_fkey(school),
         game_lines(provider, spread_home, source)`,
      )
      .eq("season_id", season.id)
      .eq("season_type", "regular")
      .eq("week", week)
      .order("kickoff_at")
      .order("id"),
    "load games",
  );

  const games = rows
    .map((g) => {
      const lines = g.game_lines.map((l) => ({ provider: l.provider, spreadHome: l.spread_home === null ? null : Number(l.spread_home), source: l.source }));
      return { ...g, spreadHome: chooseSpread(lines), manual: lines.some((l) => l.provider === MANUAL_PROVIDER) };
    })
    .filter((g) => !q || g.home.school.toLowerCase().includes(q) || g.away.school.toLowerCase().includes(q))
    .filter((g) => !missingOnly || g.spreadHome === null);

  const link = (w: number) => `/admin/games?week=${w}${q ? `&q=${encodeURIComponent(q)}` : ""}${missingOnly ? "&missing=1" : ""}`;

  return (
    <>
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Week {week} games</h1>
          <p className="text-sm text-muted-foreground">
            {year} season · {games.length} shown · a manual line overrides CFBD&apos;s for Underdog week
          </p>
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap gap-1">
          {weeks.map((w) => (
            <Link
              key={w}
              href={link(w)}
              aria-current={w === week ? "page" : undefined}
              className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm tabular-nums ${
                w === week ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {w}
            </Link>
          ))}
        </nav>
        {/* A plain GET form: submitting it just changes the URL's query string. */}
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="week" value={week} />
          <Input name="q" defaultValue={q} placeholder="Filter by team" className="w-48" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="missing" value="1" defaultChecked={missingOnly} /> No line only
          </label>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
      </header>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {games.length === 0 && <p className="py-2 text-sm text-muted-foreground">No games match.</p>}
          {games.map((g) => (
            <Link key={g.id} href={`/admin/games/${g.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-muted/50">
              <div className="min-w-0">
                <div className="font-medium">
                  {g.away.school} {g.completed && <span className="tabular-nums">{g.away_points}</span>} @ {g.home.school}{" "}
                  {g.completed && <span className="tabular-nums">{g.home_points}</span>}
                </div>
                <div className="text-sm text-muted-foreground">{g.completed ? "Final" : formatKickoff(g.kickoff_at, g.start_time_tbd)}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={g.spreadHome === null ? "text-amber-600 dark:text-amber-400" : ""}>
                  {describeLine(g.spreadHome, g.home.school, g.away.school)}
                </span>
                {g.manual && <Badge variant="secondary">manual</Badge>}
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
