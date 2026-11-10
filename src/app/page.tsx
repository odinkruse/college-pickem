import { Suspense } from "react";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findCurrentWeek, getCalendar, seasonYearFor } from "@/lib/cfbd";
import { MissingEnvError } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">College Pick&apos;em</h1>
        <p className="text-muted-foreground">QB · RB · WR/TE — one shot per player, all season.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Setup status</CardTitle>
          <CardDescription>Checks each external connection on every request.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          <Suspense fallback={<StatusRow label="Supabase" state="checking" />}>
            <SupabaseStatus />
          </Suspense>
          <Suspense fallback={<StatusRow label="CollegeFootballData" state="checking" />}>
            <CfbdStatus />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

type RowState = "ok" | "error" | "checking";

function StatusRow({ label, state, detail }: { label: string; state: RowState; detail?: string }) {
  const badge = {
    ok: <Badge>Connected</Badge>,
    error: <Badge variant="destructive">Problem</Badge>,
    checking: <Badge variant="outline">Checking…</Badge>,
  }[state];
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {detail && <div className="text-sm break-words text-muted-foreground">{detail}</div>}
      </div>
      {badge}
    </div>
  );
}

function describeError(error: unknown): string {
  if (error instanceof MissingEnvError) return `Not configured: set ${error.variable}`;
  return error instanceof Error ? error.message : String(error);
}

type Check = { state: "ok" | "error"; detail: string };

async function checkSupabase(): Promise<Check> {
  try {
    // Reads the seeded league through the typed client: proves URL, secret key, schema and grants.
    const { data: league, error } = await createAdminClient()
      .from("leagues")
      .select("name, entries(seasons(year))")
      .eq("slug", "main")
      .maybeSingle();
    if (error) return { state: "error", detail: error.message };
    if (!league) return { state: "error", detail: "Connected, but the league isn't seeded (run supabase/seed.sql)" };
    const years = league.entries.map((e) => e.seasons.year).sort().join(", ");
    return { state: "ok", detail: `${league.name} · seasons ${years}` };
  } catch (error) {
    return { state: "error", detail: describeError(error) };
  }
}

async function checkCfbd(now: Date): Promise<Check> {
  try {
    const year = seasonYearFor(now);
    const week = findCurrentWeek(await getCalendar(year), now);
    if (!week) return { state: "ok", detail: `${year} calendar is empty` };
    const label = week.seasonType === "regular" ? `Week ${week.week}` : "Postseason";
    return { state: "ok", detail: `${year} season · ${label}` };
  } catch (error) {
    return { state: "error", detail: describeError(error) };
  }
}

async function SupabaseStatus() {
  await connection();
  const { state, detail } = await checkSupabase();
  return <StatusRow label="Supabase" state={state} detail={detail} />;
}

async function CfbdStatus() {
  await connection();
  const { state, detail } = await checkCfbd(new Date());
  return <StatusRow label="CollegeFootballData" state={state} detail={detail} />;
}
