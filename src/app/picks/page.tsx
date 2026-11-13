import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LockTime } from "@/components/time";
import { getViewer } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { loadWeekContext, pickWarnings, teamSpread, type SeasonPick, type WeekContext } from "@/lib/picks/service";
import type { Slot } from "@/lib/rules";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { RemovePickButton, WeekRuleSelect } from "./controls";
import { formatSpread, RULE_HINT, RULE_LABEL, SLOT_LABEL } from "./format";
import { PickDialog } from "./pick-dialog";

// The signed-in member's picks for one week (picks/layout.tsx guarantees a linked member).
export default function PicksPage(props: PageProps<"/picks">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading picks…</p>}>
        <PicksWeek searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const SLOTS: Slot[] = ["QB", "RB", "WRTE"];

async function PicksWeek({ searchParams }: { searchParams: PageProps<"/picks">["searchParams"] }) {
  await connection();
  const now = new Date();
  const params = await searchParams;
  const year = seasonYearFor(now);
  const { weeks, current } = await seasonWeeks(year, now);
  const requested = Number(params.week);
  const week = weeks.includes(requested) ? requested : current;

  const viewer = (await getViewer())!;
  const ctx = await loadWeekContext(createAdminClient(), year, week, viewer.profileId!);
  const weekPicks = new Map(ctx.entryPicks.filter((p) => p.week === week).map((p) => [p.slot, p]));
  const weekPoints = [...weekPicks.values()].reduce((sum, p) => sum + (p.points ?? 0), 0);

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Week {week}</h1>
            <p className="text-sm text-muted-foreground">
              {year} season · {ctx.games.length} games · {RULE_HINT[ctx.weekRule]}
            </p>
          </div>
          {viewer.isAdmin ? (
            <WeekRuleSelect year={year} week={week} rule={ctx.weekRule} />
          ) : (
            ctx.weekRule !== "standard" && <span className="rounded-md border px-2 py-1 text-sm">{RULE_LABEL[ctx.weekRule]}</span>
          )}
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap gap-1">
          {weeks.map((w) => (
            <Link
              key={w}
              href={`/picks?week=${w}`}
              aria-current={w === week ? "page" : undefined}
              className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm tabular-nums ${
                w === week ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              } ${w === current && w !== week ? "font-semibold underline underline-offset-4" : ""}`}
            >
              {w}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-4">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} ctx={ctx} slot={slot} pick={weekPicks.get(slot)} now={now} />
        ))}
      </div>

      {[...weekPicks.values()].some((p) => p.points !== null) && (
        <p className="text-right text-sm">
          Week total: <span className="font-semibold tabular-nums">{weekPoints}</span>
        </p>
      )}
    </>
  );
}

function SlotCard({ ctx, slot, pick, now }: { ctx: WeekContext; slot: Slot; pick?: SeasonPick; now: Date }) {
  const game = pick ? ctx.gameByTeam.get(pick.teamId) : undefined;
  const weekOver = ctx.games.every((g) => now >= g.lockAt);
  const locked = pick ? now >= pick.lockAt : weekOver;
  const warnings = pick ? pickWarnings(ctx, pick, now) : [];
  const showSpread = ctx.weekRule === "underdog";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{SLOT_LABEL[slot]}</CardTitle>
        <CardAction className="flex items-center gap-1">
          {pick && !locked && <RemovePickButton year={ctx.year} week={ctx.week} slot={slot} />}
          {!locked && <PickDialog year={ctx.year} week={ctx.week} slot={slot} triggerLabel={pick ? "Change" : "Pick"} showSpread={showSpread} />}
        </CardAction>
      </CardHeader>
      <CardContent>
        {!pick ? (
          <p className="text-muted-foreground">{weekOver ? "No pick made." : "No pick yet."}</p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-lg font-semibold">
                {pick.playerName} <span className="text-sm font-normal text-muted-foreground">{pick.position}</span>
              </div>
              <PickStatusBadge pick={pick} locked={locked} />
            </div>
            {game && (
              <div className="text-sm text-muted-foreground">
                <span className="text-foreground">{pick.team.school}</span>{" "}
                {game.home.teamId === pick.teamId ? "vs" : "@"}{" "}
                {(game.home.teamId === pick.teamId ? game.awayTeam : game.homeTeam).school}
                {" · "}
                {formatSpread(teamSpread(game, pick.teamId))}
                {" · "}
                <LockTime lockAt={pick.lockAt.toISOString()} />
              </div>
            )}
            {pick.reviewReason && <p className="text-sm text-amber-600 dark:text-amber-400">Under review: {pick.reviewReason}</p>}
            {warnings.length > 0 && (
              <ul className="text-sm text-amber-600 dark:text-amber-400">
                {warnings.map((w) => (
                  <li key={w.code}>⚠ {w.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PickStatusBadge({ pick, locked }: { pick: SeasonPick; locked: boolean }) {
  if (pick.status === "final") return <Badge>{pick.points ?? 0} pts</Badge>;
  if (pick.status === "dnp") return <Badge variant="outline">Did not play</Badge>;
  if (locked || pick.status === "locked") return <Badge variant="secondary">Locked</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
