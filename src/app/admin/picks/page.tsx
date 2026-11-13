import { Suspense } from "react";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { seasonYearFor } from "@/lib/cfbd";
import { OWNER_PROFILE_ID } from "@/lib/picks/service";
import type { Slot } from "@/lib/rules";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { CopyButton } from "../copy-button";
import { changePickAction, undoPickChangeAction } from "../import-actions";

const SLOTS: Slot[] = ["QB", "RB", "WRTE"];
const SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };
const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

// Any member's picks for a week, with a "change" box for swaps that arrive after the sheet (email etc.).
export default function MemberPicksPage(props: PageProps<"/admin/picks">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/picks" />
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <MemberPicks searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function MemberPicks({ searchParams }: { searchParams: PageProps<"/admin/picks">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const now = new Date();
  const year = seasonYearFor(now);
  const db = createAdminClient();
  const [{ weeks, current }, entriesResult] = await Promise.all([
    seasonWeeks(year, now),
    db.from("entries").select("id, profile_id, profiles(display_name), seasons!inner(year), leagues!inner(slug)").eq("seasons.year", year).eq("leagues.slug", "main"),
  ]);
  const entries = must(entriesResult, "load entries").sort((a, b) => a.profiles.display_name.localeCompare(b.profiles.display_name));
  const fallback = entries.find((e) => e.profile_id === OWNER_PROFILE_ID) ?? entries[0];
  const entry = entries.find((e) => e.id === Number(params.entry)) ?? fallback;
  const week = weeks.includes(Number(params.week)) ? Number(params.week) : current;
  if (!entry) return <p className="text-muted-foreground">No entries for {year} yet. Run an import first.</p>;

  const [picksResult, overridesResult, weekPicksResult] = await Promise.all([
    db.from("picks").select("slot, status, points, review_reason, players(name), teams(school)").eq("entry_id", entry.id).eq("week", week),
    db.from("pick_import_overrides").select("slot, cell_text, players(name)").eq("entry_id", entry.id).eq("week", week),
    db
      .from("picks")
      .select("slot, entered_via, players(name), teams(school), entries!inner(seasons!inner(year), profiles(display_name))")
      .eq("entries.seasons.year", year)
      .eq("week", week),
  ]);
  const weekPicks = must(weekPicksResult, "load week picks");
  const byMember = new Map<string, typeof weekPicks>();
  for (const p of weekPicks) byMember.set(p.entries.profiles.display_name, [...(byMember.get(p.entries.profiles.display_name) ?? []), p]);
  const exportText = [...byMember]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => {
      const cell = (slot: Slot) => {
        const p = list.find((x) => x.slot === slot);
        return p ? `${p.players.name} - ${p.teams.school}${p.entered_via === "app" ? " (app)" : ""}` : "—";
      };
      return `${name}: ${SLOTS.map(cell).join(" | ")}`;
    })
    .join("\n");
  const appCount = weekPicks.filter((p) => p.entered_via === "app").length;
  const picks = must(picksResult, "load picks");
  const overrides = must(overridesResult, "load overrides");

  return (
    <>
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Member picks</h1>
          <p className="text-sm text-muted-foreground">
            Change anyone&apos;s pick after the fact, e.g. a swap announced by email. The change sticks through later imports until that
            cell is edited in the sheet.
          </p>
        </div>
        {/* GET form: choosing a member/week just changes the URL. */}
        <form className="flex flex-wrap items-center gap-2">
          <select name="entry" aria-label="Member" defaultValue={entry.id} className={selectClass}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.profiles.display_name}
              </option>
            ))}
          </select>
          <select name="week" aria-label="Week" defaultValue={week} className={selectClass}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Show
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {entry.profiles.display_name} · week {week}
          </CardTitle>
          <CardDescription>Type the new player as &ldquo;Name - School&rdquo;. Saving rescores the week.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {SLOTS.map((slot) => {
            const pick = picks.find((p) => p.slot === slot);
            const override = overrides.find((o) => o.slot === slot);
            return (
              <div key={slot} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <div>
                    <span className="inline-block w-12 text-muted-foreground">{SLOT_LABEL[slot]}</span>
                    {pick ? (
                      <>
                        <span className="font-medium">{pick.players.name}</span> <span className="text-muted-foreground">· {pick.teams.school}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No pick</span>
                    )}
                    {override && (
                      <Badge variant="secondary" className="ml-2" title={`Sheet says "${override.cell_text}"`}>
                        changed by hand
                      </Badge>
                    )}
                  </div>
                  {pick && (
                    <span className="tabular-nums">
                      {pick.status === "dnp" ? "DNP" : pick.points !== null ? `${pick.points} pts` : pick.status}
                      {pick.review_reason && <span className="text-amber-600 dark:text-amber-400"> · review</span>}
                    </span>
                  )}
                </div>
                {override && <p className="text-xs text-muted-foreground">Sheet says &ldquo;{override.cell_text}&rdquo;.</p>}
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm key={`${entry.id}|${week}|${slot}`} action={changePickAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="entry" value={entry.id} />
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="slot" value={slot} />
                    <Input name="typed" placeholder="Name - School" aria-label={`New ${SLOT_LABEL[slot]}`} className="w-56" />
                    <Button type="submit" size="sm" variant="outline">
                      Change
                    </Button>
                  </ActionForm>
                  {override && (
                    <ActionForm action={undoPickChangeAction}>
                      <input type="hidden" name="entry" value={entry.id} />
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="slot" value={slot} />
                      <Button type="submit" size="sm" variant="ghost" title="Use the sheet's cell again (re-imports the week)">
                        Undo change
                      </Button>
                    </ActionForm>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Week {week} picks as text</CardTitle>
          <CardDescription>
            Everyone&apos;s picks as QB | RB | WR/TE, e.g. for the weekly email or Josh&apos;s sheet. {appCount} made in the app this week are
            marked &ldquo;(app)&rdquo;; those aren&apos;t in the sheet unless someone copies them in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {exportText ? (
            <>
              <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{exportText}</pre>
              <div>
                <CopyButton text={exportText} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No picks for week {week} yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
