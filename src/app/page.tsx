import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StandingsTable } from "@/components/standings-table";
import { getViewer } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { loadStandings } from "@/lib/standings";
import { createAdminClient } from "@/lib/supabase/admin";

// Public home page: the leaderboard, plus a way in for members.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">College Pick&apos;em</h1>
          <p className="text-muted-foreground">QB · RB · WR/TE: one shot per player, all season.</p>
        </div>
        <Suspense fallback={null}>
          <CallToAction />
        </Suspense>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading standings…</p>}>
        <Leaderboard />
      </Suspense>
    </main>
  );
}

async function CallToAction() {
  const viewer = await getViewer();
  if (viewer?.profileId) {
    return (
      <Link href="/picks" className={buttonVariants()}>
        Make your picks
      </Link>
    );
  }
  if (viewer) return null;
  return (
    <Link href="/login" className={buttonVariants({ variant: "outline" })}>
      Sign in to pick
    </Link>
  );
}

const TOP = 10;

async function Leaderboard() {
  await connection();
  const year = seasonYearFor(new Date());
  const { rows, weeks } = await loadStandings(createAdminClient(), year);
  if (rows.length === 0) return <p className="text-muted-foreground">No scores yet for {year}.</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {year} leaderboard <span className="font-normal text-muted-foreground">· through week {weeks.at(-1)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 overflow-x-auto">
        <StandingsTable rows={rows.slice(0, TOP)} lastWeek={weeks.at(-1)} />
        <Link href="/standings" className="text-sm underline underline-offset-4">
          Full standings and week-by-week ({rows.length} entries)
        </Link>
      </CardContent>
    </Card>
  );
}
