import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { currentSeasonYear, startedSeasonYears } from "@/lib/season";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { StandingsTable } from "@/components/standings-table";
import { loadStandings } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";

// League standings. Public (no sign-in needed): it shows only names and points, the same
// things the league's own sheet shows. Individual picks appear only once their game has kicked off.
export default function StandingsPage(props: PageProps<"/standings">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading standings…</p>}>
        <Standings searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Standings({ searchParams }: { searchParams: PageProps<"/standings">["searchParams"] }) {
  await connection();
  const db = createAdminClient();
  const [params, current, seasons] = await Promise.all([searchParams, currentSeasonYear(db), startedSeasonYears(db)]);
  // ?year=2026 shows a past season; anything else shows the current one.
  const requested = Number(params.year);
  const year = seasons.includes(requested) ? requested : current;
  const [{ rows, weeks }, viewer] = await Promise.all([loadStandings(db, year), getViewer()]);
  const lastWeek = weeks.at(-1);
  const best = (week: number) => Math.max(...rows.map((r) => r.byWeek.get(week) ?? -Infinity));

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Standings</h1>
        <p className="text-sm text-muted-foreground">
          {year} season · {rows.length} entries · {weeks.length ? `through week ${lastWeek}` : "no scores yet"}
        </p>
        {seasons.length > 1 && (
          <nav aria-label="Seasons" className="mt-3 flex flex-wrap gap-1.5">
            {seasons.map((y) => (
              <Link
                key={y}
                href={y === current ? "/standings" : `/standings?year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={`border-[3px] border-outline px-3 py-2 font-pixel text-[10px] no-underline ${
                  y === year ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"
                }`}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <Card className="py-0">
        <CardContent className="overflow-x-auto px-0">
          <StandingsTable rows={rows} lastWeek={lastWeek} youProfileId={viewer?.profileId} />
        </CardContent>
      </Card>

      {weeks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By week</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-sm tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-card py-2 pr-3 text-left font-normal">Name</th>
                  {weeks.map((w) => (
                    <th key={w} className="px-2 py-2 text-right font-normal">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.entryId}>
                    <td className="sticky left-0 bg-card py-1.5 pr-3 font-medium">{r.name}</td>
                    {weeks.map((w) => {
                      const pts = r.byWeek.get(w);
                      return (
                        <td key={w} className={`px-2 py-1.5 text-right ${pts !== undefined && pts === best(w) ? "font-bold text-primary" : ""}`}>
                          {pts ?? "–"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Gold: the week&apos;s top score.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
