import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import type { Slot } from "@/lib/rules";
import { loadEntryPicks } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";

const SLOTS: Slot[] = ["QB", "RB", "WRTE"];
const SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };

// One entry's picks, week by week. A pick shows only after its game has kicked off.
export default function EntryPage(props: PageProps<"/standings/[entry]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EntryPicks params={props.params} />
      </Suspense>
    </main>
  );
}

async function EntryPicks({ params }: { params: PageProps<"/standings/[entry]">["params"] }) {
  await connection();
  const entryId = Number((await params).entry);
  if (!Number.isInteger(entryId)) notFound();
  const data = await loadEntryPicks(createAdminClient(), entryId, new Date());
  if (!data) notFound();

  const weeks = [...new Set(data.picks.map((p) => p.week))].sort((a, b) => b - a);
  const total = data.picks.reduce((sum, p) => sum + (p.points ?? 0), 0);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/standings" className="text-sm text-muted-foreground hover:underline">
            ← Standings
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
          <p className="text-sm text-muted-foreground">{data.year} season</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{total}</div>
          <div className="text-sm text-muted-foreground">points</div>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {weeks.length === 0 && <p className="text-sm text-muted-foreground">No picks yet.</p>}
          {weeks.map((week) => {
            const weekPicks = data.picks.filter((p) => p.week === week);
            const weekTotal = weekPicks.reduce((sum, p) => sum + (p.points ?? 0), 0);
            return (
              <section key={week} className="py-3">
                <div className="flex justify-between font-medium">
                  <span>Week {week}</span>
                  <span className="tabular-nums">{weekPicks.some((p) => p.points !== null) ? weekTotal : "–"}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                  {SLOTS.map((slot) => {
                    const p = weekPicks.find((x) => x.slot === slot);
                    return (
                      <li key={slot} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="inline-block w-12 text-muted-foreground">{SLOT_LABEL[slot]}</span>
                          {!p ? (
                            <span className="text-muted-foreground">—</span>
                          ) : p.player ? (
                            <>
                              {p.player.name}{" "}
                              <span className="text-muted-foreground">
                                · {p.player.school} {p.player.home ? "vs" : "@"} {p.player.opponent}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Hidden until kickoff</span>
                          )}
                        </span>
                        {p && (
                          <span className="tabular-nums">
                            {p.status === "dnp" ? <span className="text-muted-foreground">DNP</span> : (p.points ?? <span className="text-muted-foreground">–</span>)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
