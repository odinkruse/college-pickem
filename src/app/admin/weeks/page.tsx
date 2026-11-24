import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RULE_LABEL } from "@/app/picks/format";
import type { WeekRule } from "@/lib/rules";
import { currentSeasonYear, leagueLastWeek } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { saveWeekSettingsAction } from "./actions";

// The current season's week types (Conference, Underdog, Championship) and last week, editable
// mid-season, with each week's dates and progress.
export default function WeeksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/weeks" />
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Weeks />
      </Suspense>
    </main>
  );
}

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const checkbox = "size-5 shrink-0 accent-[var(--primary)]";

async function Weeks() {
  await connection();
  const db = createAdminClient();
  const year = await currentSeasonYear(db);
  const [lastWeek, rules, summary] = await Promise.all([
    leagueLastWeek(year, db),
    db.from("league_weeks").select("week, rule, leagues!inner(slug), seasons!inner(year)").eq("leagues.slug", "main").eq("seasons.year", year),
    db.rpc("week_summary", { p_year: year }),
  ]);
  const ruleOf = (week: number) => (must(rules, "load week types").find((r) => r.week === week)?.rule ?? "standard") as WeekRule;
  const weekOf = (rule: WeekRule) => must(rules, "load week types").find((r) => r.rule === rule)?.week ?? "";
  const byWeek = new Map(must(summary, "load week summary").map((s) => [s.week, s]));
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Weeks</h1>
        <p className="mt-1 text-sm">
          The {year} season&apos;s special weeks. Members see the week type and its banner on the picks page; only admins can change it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Special weeks</CardTitle>
          <CardDescription>Clear a box for no such week this season. Each week can only be one type.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveWeekSettingsAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <WeekField label="Conference" name="conference_week" value={weekOf("conference")} max={lastWeek} />
              <WeekField label="Underdog" name="underdog_week" value={weekOf("underdog")} max={lastWeek} />
              <WeekField label="Championship" name="championship_week" value={weekOf("championship")} max={lastWeek} />
              <WeekField label="Last week" name="last_week" value={lastWeek} max={20} required />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="allow_started" className={`${checkbox} mt-0.5`} />
              <span>
                Change weeks that have started. Only needed when a week that&apos;s already kicked off changes type; its picks are then
                judged by the new rule.
              </span>
            </label>
            <Button type="submit" className="w-fit">
              Save weeks
            </Button>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Regular-season FBS and FCS games (FCS playoff games aren&apos;t counted).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Week</th>
                <th className="py-2 pr-3 font-normal">Dates</th>
                <th className="py-2 pr-3 font-normal">Type</th>
                <th className="py-2 pr-3 font-normal">Games</th>
                <th className="py-2 font-normal">Picks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {weeks.map((w) => {
                const s = byWeek.get(w);
                const rule = ruleOf(w);
                return (
                  <tr key={w}>
                    <td className="py-2 pr-3">
                      <Link href={`/picks?week=${w}`} className="font-pixel text-[10px] underline-offset-4 hover:underline">
                        {w}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {s?.first_kickoff && s.last_kickoff ? `${dayFormat.format(new Date(s.first_kickoff))} – ${dayFormat.format(new Date(s.last_kickoff))}` : "—"}
                    </td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${rule === "standard" ? "text-muted-foreground" : "font-semibold text-primary"}`}>
                      {RULE_LABEL[rule].replace(" week", "")}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s ? status(s) : "No games yet"}</td>
                    <td className="py-2">{s?.picks ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function status(s: { games: number; started: number; completed: number }): string {
  if (s.completed === s.games) return `${s.games} · final`;
  if (s.started === 0) return `${s.games} · upcoming`;
  return `${s.games} · ${s.completed} final`;
}

function WeekField({ label, name, value, max, required }: { label: string; name: string; value: number | string; max: number; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input name={name} type="number" min={1} max={max} defaultValue={value} required={required} className="w-full" />
    </label>
  );
}
