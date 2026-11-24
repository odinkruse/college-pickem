import { Suspense } from "react";
import { currentSeasonYear } from "@/lib/season";
import { connection } from "next/server";
import { BestGame, DIVISION_LABEL, LeaderList, STAT_SLOT_LABEL, STAT_SLOTS } from "@/components/player-stats";
import type { Division } from "@/lib/stats/leaders";
import { loadPlayerStats } from "@/lib/stats/player-stats";

// Public: every FBS and FCS player's season under the league's scoring, picked or not.
export default function StatsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="font-pixel text-[10px]">Loading stats…</p>}>
        <Stats />
      </Suspense>
    </main>
  );
}

const DIVISIONS: Division[] = ["fbs", "fcs"];

async function Stats() {
  await connection();
  const year = await currentSeasonYear();
  const stats = await loadPlayerStats(year);
  if (!stats) return <p className="font-pixel text-[10px]">No stats yet for {year}.</p>;

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Player stats</h1>
        <p className="mt-1 text-sm">
          {year} season{stats.throughWeek !== null && `, through week ${stats.throughWeek}`}. Every FBS and FCS player under the league&apos;s
          scoring, picked or not. &ldquo;Picked&rdquo; counts league entries that used him.
        </p>
      </header>

      <section className="panel grid gap-6 p-5 sm:grid-cols-3" aria-label="Leaders">
        {STAT_SLOTS.map((s) => (
          <div key={s} className="flex min-w-0 flex-col gap-2">
            <h2 className="text-xs text-primary">{STAT_SLOT_LABEL[s]}</h2>
            <div>
              <p className="font-pixel text-[8px] text-accent">Top 3</p>
              <LeaderList leaders={stats.overall[s]} showDivision />
            </div>
            <div>
              <p className="font-pixel text-[8px] text-accent">Best game</p>
              <BestGame slot={s} game={stats.bestGame[s]} />
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        {STAT_SLOTS.flatMap((s) =>
          DIVISIONS.map((d) => {
            const leaders = stats.byDivision[s][d];
            return (
              <details key={`${s}-${d}`} className="panel group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <h2 className="text-xs text-primary">
                      {DIVISION_LABEL[d]} {STAT_SLOT_LABEL[s]}s
                    </h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {leaders[0] ? `${leaders[0].name}, ${leaders[0].total}` : "No games yet"}
                    </p>
                  </div>
                  <span aria-hidden="true" className="font-pixel text-xs text-primary transition-transform group-open:rotate-90">
                    ►
                  </span>
                </summary>
                <div className="border-t-4 border-outline px-4 pb-3">
                  <LeaderList leaders={leaders} />
                </div>
              </details>
            );
          }),
        )}
      </div>
    </>
  );
}
