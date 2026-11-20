import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
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
            <h1 className="text-xl sm:text-2xl">Week {week}</h1>
            <p className="mt-1 text-sm text-foreground">
              {year} season · {ctx.games.length} games · {RULE_HINT[ctx.weekRule]}
            </p>
          </div>
          {viewer.isAdmin ? (
            <WeekRuleSelect year={year} week={week} rule={ctx.weekRule} />
          ) : (
            ctx.weekRule !== "standard" && <span className="bg-accent px-2 py-1.5 font-pixel text-[9px] text-accent-foreground">{RULE_LABEL[ctx.weekRule]}</span>
          )}
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap gap-1.5">
          {weeks.map((w) => (
            <Link
              key={w}
              href={`/picks?week=${w}`}
              aria-current={w === week ? "page" : undefined}
              className={`flex size-10 items-center justify-center border-[3px] border-outline font-pixel text-[10px] no-underline tabular-nums ${
                w === week ? "bg-primary text-primary-foreground shadow-pixel-sm" : "bg-card text-card-foreground hover:bg-muted"
              } ${w === current && w !== week ? "border-primary" : ""}`}
            >
              {w}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-5 sm:grid-cols-3">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} ctx={ctx} slot={slot} pick={weekPicks.get(slot)} now={now} />
        ))}
      </div>

      {[...weekPicks.values()].some((p) => p.points !== null) && (
        <div className="panel ml-auto flex items-center gap-4 px-5 py-3">
          <span className="font-pixel text-[9px] text-muted-foreground">Week total</span>
          <span className="font-pixel text-2xl text-primary tabular-nums">{weekPoints}</span>
        </div>
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
  const initials = pick?.playerName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 bg-primary px-3 py-2.5 font-pixel text-[10px] text-primary-foreground">
        <span>{SLOT_LABEL[slot]}</span>
        {pick && <PickStatus pick={pick} locked={locked} />}
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 py-4">
        {!pick ? (
          <p className="text-muted-foreground">{weekOver ? "No pick made." : "No pick yet."}</p>
        ) : (
          <>
            <div aria-hidden="true" className="flex size-14 items-center justify-center border-[3px] border-outline bg-field font-pixel text-sm text-white">
              {initials}
            </div>
            <div className="text-lg leading-tight font-bold">
              {pick.playerName} <span className="text-sm font-normal text-muted-foreground">{pick.position}</span>
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
            {pick.reviewReason && <p className="text-sm text-warning">Under review: {pick.reviewReason}</p>}
            {warnings.length > 0 && (
              <ul className="text-sm text-warning">
                {warnings.map((w) => (
                  <li key={w.code}>⚠ {w.message}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
      {(pick?.status === "final" || !locked) && (
        <div className="flex min-h-14 items-center justify-between gap-2 border-t-4 border-dashed border-border px-4 py-3">
          {pick?.status === "final" ? (
            <>
              <span className="font-pixel text-[9px] text-muted-foreground">Points</span>
              <span className="font-pixel text-2xl text-primary tabular-nums">{pick.points ?? 0}</span>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              {pick && <RemovePickButton year={ctx.year} week={ctx.week} slot={slot} />}
              <PickDialog year={ctx.year} week={ctx.week} slot={slot} triggerLabel={pick ? "Change" : "Pick"} showSpread={showSpread} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PickStatus({ pick, locked }: { pick: SeasonPick; locked: boolean }) {
  if (pick.status === "final") return <span>Final</span>;
  if (pick.status === "dnp") return <span>Did not play</span>;
  if (locked || pick.status === "locked") return <span>Locked</span>;
  return <span>Pending</span>;
}
