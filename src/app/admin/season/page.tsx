import { Suspense } from "react";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { currentSeasonYear } from "@/lib/season";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { startSeasonAction } from "./actions";

// Start the next season: settings, special weeks, who's back (with contact details), who's new.
export default function NewSeasonPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/season" />
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewSeason />
      </Suspense>
    </main>
  );
}

const NEW_ROWS = 6;
const sheetUrl = (id: string | null | undefined) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : "");
const checkbox = "size-5 shrink-0 accent-[var(--primary)]";

async function NewSeason() {
  await connection();
  const db = createAdminClient();
  const year = await currentSeasonYear(db);

  const [config, rules, members] = await Promise.all([
    db
      .from("league_seasons")
      .select("pick_sheet_id, scoring_sheet_id, last_week, leagues!inner(slug), seasons!inner(year)")
      .eq("leagues.slug", "main")
      .eq("seasons.year", year)
      .maybeSingle(),
    db.from("league_weeks").select("week, rule, leagues!inner(slug), seasons!inner(year)").eq("leagues.slug", "main").eq("seasons.year", year),
    db
      .from("league_members")
      .select("profiles(id, display_name, contact_email, phone, auth_user_id, entries(seasons(year))), leagues!inner(slug)")
      .eq("leagues.slug", "main"),
  ]);
  const lastWeek = config.data?.last_week ?? 14;
  const weekOf = (rule: string) => must(rules, "load special weeks").find((r) => r.rule === rule)?.week ?? "";
  const people = must(members, "load members")
    .map((m) => ({ ...m.profiles, current: m.profiles.entries.some((e) => e.seasons.year === year) }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.display_name.localeCompare(b.display_name));
  const playing = people.filter((p) => p.current).length;

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Start a new season</h1>
        <p className="mt-1 text-sm">
          The site is on the {year} season ({playing} entries). Submitting this switches everything to the new season: standings, picks,
          stats and colors. {year} stays viewable on the Standings page, and last season&apos;s winner wears their colors in week 1.
        </p>
      </header>

      <ActionForm action={startSeasonAction} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Season</CardTitle>
            <CardDescription>
              Special weeks are copied from {year}; clear one to skip it. Sheets are optional if everyone picks in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Year">
              <Input name="year" type="number" defaultValue={year + 1} required className="w-32" />
            </Field>
            <Field label="Last week">
              <Input name="last_week" type="number" min={1} max={20} defaultValue={lastWeek} required className="w-32" />
            </Field>
            <Field label="Conference week">
              <Input name="conference_week" type="number" min={1} max={20} defaultValue={weekOf("conference")} className="w-32" />
            </Field>
            <Field label="Underdog week">
              <Input name="underdog_week" type="number" min={1} max={20} defaultValue={weekOf("underdog")} className="w-32" />
            </Field>
            <Field label="Championship week">
              <Input name="championship_week" type="number" min={1} max={20} defaultValue={weekOf("championship")} className="w-32" />
            </Field>
            <div className="hidden sm:block" />
            <Field label="Pick sheet (link)" hint={config.data?.pick_sheet_id ? `${year}: ${sheetUrl(config.data.pick_sheet_id)}` : undefined}>
              <Input name="pick_sheet" placeholder="https://docs.google.com/spreadsheets/d/…" />
            </Field>
            <Field label="Scoring sheet (link)" hint={config.data?.scoring_sheet_id ? `${year}: ${sheetUrl(config.data.scoring_sheet_id)}` : undefined}>
              <Input name="scoring_sheet" placeholder="https://docs.google.com/spreadsheets/d/…" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Untick anyone who isn&apos;t back; they keep their history. Logins and favorite teams carry over. Contact details are kept on file
              for sending invite links.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {people.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 py-3">
                <input type="hidden" name={`m${i}_id`} value={p.id} />
                <label className="flex w-28 items-center gap-2 text-sm">
                  <input type="checkbox" name={`m${i}_returning`} defaultChecked={p.current} className={checkbox} />
                  {p.current ? "Back" : "Former"}
                </label>
                <Input name={`m${i}_name`} defaultValue={p.display_name} aria-label="Name" required className="w-full sm:w-36" />
                <Input name={`m${i}_email`} type="email" defaultValue={p.contact_email ?? ""} placeholder="Email" aria-label={`${p.display_name}'s email`} className="w-full min-w-0 sm:w-56 sm:flex-1" />
                <Input name={`m${i}_phone`} type="tel" defaultValue={p.phone ?? ""} placeholder="Phone" aria-label={`${p.display_name}'s phone`} className="w-full sm:w-36" />
                {p.auth_user_id && <span className="font-pixel text-[8px] text-muted-foreground">Signed in</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New members</CardTitle>
            <CardDescription>Each gets an entry and an invite link (on the Members page). Leave extra rows blank.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: NEW_ROWS }, (_, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 border-b border-border pb-3 last:border-0 sm:border-0 sm:pb-0">
                <Input name={`n${i}_name`} placeholder="Name" aria-label={`New member ${i + 1} name`} className="w-full sm:w-36" />
                <Input name={`n${i}_email`} type="email" placeholder="Email" aria-label={`New member ${i + 1} email`} className="w-full min-w-0 sm:w-56 sm:flex-1" />
                <Input name={`n${i}_phone`} type="tel" placeholder="Phone" aria-label={`New member ${i + 1} phone`} className="w-full sm:w-36" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="sync" defaultChecked className={`${checkbox} mt-0.5`} />
              <span>
                Load the new season&apos;s CFBD data now: teams, games, rosters and lines (about 5 calls). CFBD usually has the schedule and
                rosters by summer; if it&apos;s too early, run &ldquo;Sync everything&rdquo; on the overview later.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" required className={`${checkbox} mt-0.5`} />
              <span>I&apos;m ready: switch the site to the new season.</span>
            </label>
            <Button type="submit" size="lg" className="w-fit">
              Start the season ►
            </Button>
          </CardContent>
        </Card>
      </ActionForm>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
