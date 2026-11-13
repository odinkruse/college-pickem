import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { loadWeekContext, type SeasonPick } from "@/lib/picks/service";
import type { Slot, WeekRule } from "@/lib/rules";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { RULE_LABEL, SLOT_LABEL } from "../format";

// Season summary for the signed-in member's entry: points by week and who has been used.
export default function SeasonPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading season…</p>}>
        <SeasonSummary />
      </Suspense>
    </main>
  );
}

const SLOTS: Slot[] = ["QB", "RB", "WRTE"];

async function SeasonSummary() {
  await connection();
  const now = new Date();
  const year = seasonYearFor(now);
  const db = createAdminClient();
  const { weeks, current } = await seasonWeeks(year, now);
  const viewer = (await getViewer())!;
  const ctx = await loadWeekContext(db, year, current, viewer.profileId!);
  const rules = (await db.from("league_weeks").select("week, rule").eq("league_id", ctx.leagueId).eq("season_id", ctx.seasonId)).data ?? [];
  const ruleByWeek = new Map(rules.map((r) => [r.week, r.rule as WeekRule]));

  const picks = ctx.entryPicks;
  const total = picks.reduce((sum, p) => sum + (p.points ?? 0), 0);
  const shownWeeks = weeks.filter((w) => w <= current || picks.some((p) => p.week === w)).reverse();
  const used = picks.filter((p) => p.status !== "dnp");
  const released = picks.filter((p) => p.status === "dnp");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{year} season</h1>
          <p className="text-sm text-muted-foreground">
            {used.length} players used · {picks.filter((p) => p.status === "final").length} picks scored
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{total}</div>
          <div className="text-sm text-muted-foreground">points</div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>By week</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {shownWeeks.map((week) => {
            const weekPicks = picks.filter((p) => p.week === week);
            const rule = ruleByWeek.get(week);
            const weekTotal = weekPicks.reduce((sum, p) => sum + (p.points ?? 0), 0);
            return (
              <section key={week} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/picks?week=${week}`} className="font-medium hover:underline">
                    Week {week}
                    {rule && rule !== "standard" && (
                      <Badge variant="outline" className="ml-2">
                        {RULE_LABEL[rule]}
                      </Badge>
                    )}
                  </Link>
                  <span className="font-semibold tabular-nums">{weekPicks.some((p) => p.points !== null) ? weekTotal : "–"}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                  {SLOTS.map((slot) => {
                    const p = weekPicks.find((x) => x.slot === slot);
                    return (
                      <li key={slot} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="inline-block w-12 text-muted-foreground">{SLOT_LABEL[slot]}</span>
                          {p ? (
                            <>
                              {p.playerName} <span className="text-muted-foreground">· {p.team.school}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        {p && <PickResult pick={p} />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {shownWeeks.length === 0 && <p className="text-sm text-muted-foreground">No weeks yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Used players</CardTitle>
          <CardDescription>Can&apos;t be picked again this season. Includes pending picks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {SLOTS.map((slot) => {
            const list = used.filter((p) => p.slot === slot);
            return (
              <div key={slot}>
                <div className="mb-1 text-sm font-medium">{SLOT_LABEL[slot]}</div>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {list.map((p) => (
                      <li key={p.pickId}>
                        <Badge variant="secondary" title={p.team.school}>
                          {p.playerName} · wk {p.week}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {released.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium">Released (did not play)</div>
              <ul className="flex flex-wrap gap-1.5">
                {released.map((p) => (
                  <li key={p.pickId}>
                    <Badge variant="outline">
                      {p.playerName} · wk {p.week}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PickResult({ pick }: { pick: SeasonPick }) {
  if (pick.status === "dnp") return <span className="text-muted-foreground">DNP</span>;
  if (pick.points === null) return <span className="text-muted-foreground">{pick.status === "pending" ? "pending" : "locked"}</span>;
  return (
    <span className="tabular-nums" title={pick.reviewReason ?? undefined}>
      {pick.points}
      {pick.reviewReason && <span className="text-amber-600 dark:text-amber-400">*</span>}
    </span>
  );
}
