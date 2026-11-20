import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { StandingsTable } from "@/components/standings-table";
import { loadStandings } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";

// League standings. Public (no sign-in needed): it shows only names and points, the same
// things the league's own sheet shows. Individual picks appear only once their game has kicked off.
export default function StandingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading standings…</p>}>
        <Standings />
      </Suspense>
    </main>
  );
}

async function Standings() {
  await connection();
  const year = seasonYearFor(new Date());
  const [{ rows, weeks }, viewer] = await Promise.all([loadStandings(createAdminClient(), year), getViewer()]);
  const lastWeek = weeks.at(-1);
  const best = (week: number) => Math.max(...rows.map((r) => r.byWeek.get(week) ?? -Infinity));

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Standings</h1>
        <p className="text-sm text-muted-foreground">
          {year} season · {rows.length} entries · {weeks.length ? `through week ${lastWeek}` : "no scores yet"}
        </p>
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
