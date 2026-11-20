import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Countdown } from "@/components/countdown";
import { StandingsTable } from "@/components/standings-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YardLines } from "@/components/yard-lines";
import { getViewer } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { seasonWeeks } from "@/lib/season";
import { loadStandings } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { getSiteTheme } from "@/lib/theme/champion";

// Public home page: this week's scoreboard, then the leaderboard.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
      <Suspense fallback={null}>
        <ChampionBanner />
      </Suspense>
      <Suspense fallback={<section className="panel h-56" aria-label="Loading this week" />}>
        <Scoreboard />
      </Suspense>
      <YardLines />
      <Suspense fallback={<p className="font-pixel text-[10px]">Loading standings…</p>}>
        <Leaderboard />
      </Suspense>
    </main>
  );
}

/** Whose colors the site is wearing this week, and why. */
async function ChampionBanner() {
  const { champion, week } = await getSiteTheme();
  if (!champion || week === null) return null;
  const { team } = champion;
  return (
    <section className="panel flex items-center gap-4 p-4 sm:p-5">
      {team?.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- small remote logo from CFBD's CDN
        <img src={team.logoUrl} alt="" width={56} height={56} className="size-12 shrink-0 object-contain sm:size-14" />
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-pixel text-[9px] text-accent">Week {week} colors</p>
        <p className="font-pixel text-sm leading-relaxed text-primary sm:text-base">{team ? team.school : "Champion"}</p>
        <p className="text-sm text-muted-foreground">
          {champion.name} put up {champion.points} in week {champion.week}
          {team ? "." : ", but hasn't picked a favorite team yet."}
        </p>
      </div>
    </section>
  );
}

/** The current week at a glance: open, in progress or final, with a countdown to the next kickoff. */
async function Scoreboard() {
  await connection();
  const now = new Date();
  const year = seasonYearFor(now);
  const [{ current }, viewer] = await Promise.all([seasonWeeks(year, now), getViewer()]);
  const games = must(
    await createAdminClient()
      .from("games")
      .select("kickoff_at, completed, seasons!inner(year)")
      .eq("seasons.year", year)
      .eq("season_type", "regular")
      .eq("week", current),
    "load this week's games",
  );
  const nextKickoff = games
    .map((g) => g.kickoff_at)
    .filter((k) => new Date(k) > now)
    .sort()[0];
  const headline = nextKickoff ? "Picks are open" : games.some((g) => !g.completed) ? "Games in progress" : `Week ${current} is final`;

  return (
    <section className="panel flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        <p className="font-pixel text-[10px] text-accent">
          {year} season · Week {current}
        </p>
        <h1 className="text-2xl text-primary sm:text-3xl">{headline}</h1>
        <p className="text-muted-foreground">QB · RB · WR/TE. One shot at each player all season; each pick locks at its kickoff.</p>
      </div>
      <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-[0_1_280px]">
        {nextKickoff && (
          <div className="flex flex-col gap-2">
            <p className="font-pixel text-[8px] text-muted-foreground">Next kickoff in</p>
            <Countdown target={nextKickoff} />
          </div>
        )}
        <CallToAction signedIn={!!viewer} member={!!viewer?.profileId} />
      </div>
    </section>
  );
}

function CallToAction({ signedIn, member }: { signedIn: boolean; member: boolean }) {
  if (member) {
    return (
      <Link href="/picks" className={buttonVariants({ size: "lg" })}>
        Make picks ►
      </Link>
    );
  }
  if (signedIn) return null;
  return (
    <Link href="/login" className={buttonVariants({ size: "lg" })}>
      Sign in to pick ►
    </Link>
  );
}

const TOP = 10;

async function Leaderboard() {
  await connection();
  const year = seasonYearFor(new Date());
  const [{ rows, weeks }, viewer] = await Promise.all([loadStandings(createAdminClient(), year), getViewer()]);
  if (rows.length === 0) return <p className="font-pixel text-[10px]">No scores yet for {year}.</p>;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b-4 border-primary py-4">
        <CardTitle className="text-sm sm:text-base">Leaderboard</CardTitle>
        <span className="font-pixel text-[8px] text-muted-foreground">Through week {weeks.at(-1)}</span>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pt-2">
        <StandingsTable rows={rows.slice(0, TOP)} lastWeek={weeks.at(-1)} youProfileId={viewer?.profileId} />
      </CardContent>
      <div className="border-t-4 border-outline px-4 py-4">
        <Link href="/standings" className="font-pixel text-[10px] text-primary">
          Full standings ({rows.length}) ►
        </Link>
      </div>
    </Card>
  );
}
