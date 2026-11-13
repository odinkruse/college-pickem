import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { seasonYearFor } from "@/lib/cfbd";
import { compareWithScoringSheet, type Discrepancy } from "@/lib/import/compare";
import type { ImportIssue, ImportSummary } from "@/lib/import/league-import";
import { seasonWeeks } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { formatKickoff } from "../format";
import { importAction, resolveCellAction } from "../import-actions";

const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

// Import the league's picks from its Google Sheet and fix the cells that didn't match.
export default function ImportPage(props: PageProps<"/admin/import">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/import" />
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ImportContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Run = { week: number | null; status: string; started_at: string; finished_at: string | null; error: string | null; summary: ImportSummary | null };

/**
 * The current list of issues: newest run first, each week's issues taken from the newest run that
 * covered that week (an all-weeks run covers every week).
 */
function currentIssues(runs: Run[], pick: (s: ImportSummary) => ImportIssue[]): ImportIssue[] {
  const covered = new Set<number>();
  let all = false;
  const out: ImportIssue[] = [];
  for (const r of runs) {
    if (all) break;
    if (r.status !== "ok" || !r.summary) continue;
    out.push(...pick(r.summary).filter((i) => !covered.has(i.week) && (r.week === null || i.week === r.week)));
    if (r.week === null) all = true;
    else covered.add(r.week);
  }
  return out.sort((a, b) => a.week - b.week || a.member.localeCompare(b.member));
}

async function ImportContent({ searchParams }: { searchParams: PageProps<"/admin/import">["searchParams"] }) {
  await connection();
  const compare = (await searchParams).compare === "1";
  const now = new Date();
  const year = seasonYearFor(now);
  const db = createAdminClient();
  const [{ weeks, current }, config, runsResult] = await Promise.all([
    seasonWeeks(year, now),
    db.from("league_seasons").select("pick_sheet_id, seasons!inner(year), leagues!inner(slug)").eq("seasons.year", year).eq("leagues.slug", "main").maybeSingle(),
    db
      .from("sync_runs")
      .select("week, status, started_at, finished_at, error, summary")
      .eq("kind", "import")
      .eq("season_year", year)
      .order("started_at", { ascending: false })
      .limit(30),
  ]);
  const runs = (runsResult.data ?? []) as unknown as Run[];
  const last = runs[0];
  const sheetId = config.data?.pick_sheet_id;

  const unresolved = currentIssues(runs, (s) => s.unresolved);
  const errors = currentIssues(runs, (s) => s.errors);
  const warnings = currentIssues(runs, (s) => s.ruleWarnings);
  const keptApp = currentIssues(runs, (s) => s.keptApp ?? []);
  const loose = currentIssues(runs, (s) => s.loose);
  const skipped = runs.find((r) => r.status === "ok" && r.week === null)?.summary?.skippedRows ?? [];

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Import picks</h1>
        <p className="text-sm text-muted-foreground">
          {year} season · from{" "}
          {sheetId ? (
            <a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              the league sheet
            </a>
          ) : (
            "no sheet set"
          )}
          . Each tab is a member; new tabs become new members. The sheet wins: a changed cell replaces that pick.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Run the import</CardTitle>
          <CardDescription>
            Matches each cell to a player, saves the picks, then scores those weeks from the stored stats (run the week&apos;s results sync
            first). One week takes ~15 s; all weeks a couple of minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActionForm action={importAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="season" value={year} />
            <select name="week" aria-label="Week" defaultValue={current} className={selectClass}>
              <option value="all">All weeks</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              Import from sheet
            </Button>
          </ActionForm>
          {last && (
            <p className="text-sm text-muted-foreground">
              Last import: {last.week === null ? "all weeks" : `week ${last.week}`} · {formatKickoff(last.finished_at ?? last.started_at, false)} ·{" "}
              {last.status === "error" ? (
                <span className="text-destructive">{last.error}</span>
              ) : last.summary ? (
                `${last.summary.matched}/${last.summary.cells} matched, ${last.summary.inserted} new, ${last.summary.updated} changed`
              ) : (
                last.status
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Unmatched cells {unresolved.length > 0 && <Badge variant="destructive">{unresolved.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Pick the player the cell means, or type &ldquo;Name - School&rdquo;. It&apos;s remembered for that exact cell text, so editing the
            cell in the sheet later starts over.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {unresolved.length === 0 && <p className="text-sm text-muted-foreground">Everything matched.</p>}
          {unresolved.map((i) => (
            <div key={`${i.member}|${i.week}|${i.slot}`} className="flex flex-col gap-2 py-3">
              <div className="text-sm">
                <span className="font-medium">
                  {i.member} · week {i.week} {i.slot}
                </span>{" "}
                &ldquo;{i.text}&rdquo;
                <div className="text-muted-foreground">{i.problem}</div>
              </div>
              <ActionForm action={resolveCellAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="season" value={year} />
                <input type="hidden" name="member" value={i.member} />
                <input type="hidden" name="week" value={i.week} />
                <input type="hidden" name="slot" value={i.slotKey ?? ""} />
                <input type="hidden" name="text" value={i.text} />
                {i.suggestions && i.suggestions.length > 0 && (
                  <select name="player" aria-label="Player" defaultValue="" className={selectClass}>
                    <option value="">Closest matches…</option>
                    {i.suggestions.map((s) => (
                      <option key={s.playerId} value={s.playerId}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
                <Input name="typed" placeholder="or type Name - School" aria-label="Player as Name - School" className="w-56" />
                <Button type="submit" size="sm" variant="outline">
                  Save
                </Button>
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>

      {(errors.length > 0 || warnings.length > 0 || skipped.length > 0 || keptApp.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Worth a look</CardTitle>
            <CardDescription>Imported as the sheet says (except refusals), but the app disagrees with something.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <IssueList title="Refused by the database" items={errors} />
            <IssueList title="Breaks a rule as the app reads it" items={warnings} />
            <IssueList title="Picked in the app, so the sheet's different pick was ignored" items={keptApp} />
            {skipped.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Rows without a week number (ignored)</div>
                <ul className="text-muted-foreground">
                  {skipped.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Compare with the scoring sheet</CardTitle>
          <CardDescription>
            Every pick where the app&apos;s points differ from the league&apos;s hand-kept scoring sheet, with both stat lines. Usually a
            stat-source difference; if CFBD is wrong, fix the stat line on the game page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {compare ? (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Reading the scoring sheet…</p>}>
              <Comparison year={year} />
            </Suspense>
          ) : (
            <Link href="/admin/import?compare=1" className="text-sm underline underline-offset-4">
              Run the comparison (reads the scoring sheet, a few seconds)
            </Link>
          )}
        </CardContent>
      </Card>

      {loose.length > 0 && (
        <Card>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Fuzzy matches ({loose.length})</summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Typos and nicknames the import resolved on its own. If one is wrong, fix the cell in the sheet.
              </p>
              <ul className="mt-2 text-sm">
                {loose.map((i) => (
                  <li key={`${i.member}|${i.week}|${i.slot}`}>
                    {i.member} wk{i.week} {i.slot}: &ldquo;{i.text}&rdquo; <span className="text-muted-foreground">{i.problem}</span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function IssueList({ title, items }: { title: string; items: ImportIssue[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      <ul>
        {items.map((i) => (
          <li key={`${i.member}|${i.week}|${i.slot}|${i.problem}`}>
            {i.member} wk{i.week} {i.slot}: &ldquo;{i.text}&rdquo; <span className="text-muted-foreground">{i.problem}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SLOT_NAME = { QB: "QB", RB: "RB", WRTE: "WR/TE" } as const;

function statText(s: Discrepancy["app"]) {
  if (!s) return "no stat line";
  const parts = [
    s.pass && `${s.pass} pass`,
    s.rush && `${s.rush} rush`,
    s.rec && `${s.rec} rec`,
    s.td && `${s.td} TD`,
    s.to && `${s.to} TO`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "no stats";
}

async function Comparison({ year }: { year: number }) {
  let result;
  try {
    result = await compareWithScoringSheet(createAdminClient(), year);
  } catch (e) {
    return <p className="text-sm text-destructive">{e instanceof Error ? e.message : String(e)}</p>;
  }
  const { compared, discrepancies, weeks } = result;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Weeks {weeks[0]}–{weeks.at(-1)} · {compared} scored picks compared · {compared - discrepancies.filter((d) => d.kind === "points").length}{" "}
        identical · {discrepancies.length} to look at
      </p>
      <ul className="flex flex-col divide-y">
        {discrepancies.map((d) => (
          <li key={`${d.member}|${d.week}|${d.slot}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
            <div className="min-w-0">
              <div>
                <span className="font-medium">
                  {d.member} · wk {d.week} {SLOT_NAME[d.slot]}
                </span>{" "}
                {d.player ?? <span className="text-muted-foreground">no pick in the app</span>}
              </div>
              <div className="text-muted-foreground">
                App: {d.kind === "no_app_score" && d.player ? "not scored" : statText(d.app)} · Sheet: {d.sheet ? statText(d.sheet) : "blank"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 tabular-nums">
              <span>
                app <span className="font-semibold">{d.appPoints ?? "–"}</span> · sheet <span className="font-semibold">{d.sheetPoints ?? "–"}</span>
              </span>
              {d.gameId && (
                <Link href={`/admin/games/${d.gameId}?player=${d.playerId}`} className="underline underline-offset-4">
                  Stats
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
