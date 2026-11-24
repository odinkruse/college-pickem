import { Suspense } from "react";
import { currentSeasonYear } from "@/lib/season";
import { connection } from "next/server";
import { ActionForm } from "@/app/admin/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeamOptions } from "@/lib/teams";
import { teamPalette, type ThemeVars } from "@/lib/theme/palette";
import { setMyTeamAction } from "./actions";

// A member's favorite team: if they top a week, its colors theme the site the following week.
export default function MyTeamPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-xl sm:text-2xl">My team</h1>
        <p className="mt-1 text-sm">Top the league in a week and your team&apos;s colors take over the site the next week.</p>
      </header>
      <Suspense fallback={<p className="font-pixel text-[10px]">Loading…</p>}>
        <MyTeam />
      </Suspense>
    </main>
  );
}

async function MyTeam() {
  await connection();
  const viewer = (await getViewer())!;
  const db = createAdminClient();
  const [options, profile] = await Promise.all([
    loadTeamOptions(await currentSeasonYear()),
    db.from("profiles").select("favorite_team_id, teams(school, logo_url, color, alt_color)").eq("id", viewer.profileId!).single(),
  ]);
  const team = profile.data?.teams ?? null;
  const groups = (["FBS", "FCS"] as const).map((d) => ({ division: d, teams: options.filter((t) => t.division === d) }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Favorite team</CardTitle>
          <CardDescription>Any FBS or FCS school.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setMyTeamAction} className="flex flex-wrap items-center gap-2">
            <select
              name="team"
              aria-label="Favorite team"
              defaultValue={profile.data?.favorite_team_id ?? ""}
              className="h-10 min-w-0 flex-1 border-2 border-input px-2 text-base sm:max-w-sm"
            >
              <option value="">No team</option>
              {groups.map((g) => (
                <optgroup key={g.division} label={g.division}>
                  {g.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.school}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button type="submit">Save</Button>
          </ActionForm>
        </CardContent>
      </Card>

      {team && <Preview school={team.school} logoUrl={team.logo_url} vars={teamPalette(team.color, team.alt_color)} />}
    </>
  );
}

/** A miniature of the site in the team's colors. */
function Preview({ school, logoUrl, vars }: { school: string; logoUrl: string | null; vars: ThemeVars }) {
  return (
    <section aria-label={`Preview of ${school} colors`} className="flex flex-col gap-2">
      <p className="font-pixel text-[9px]">If you win a week</p>
      <div
        className="border-4 border-outline p-4 shadow-pixel"
        style={{ backgroundImage: `repeating-linear-gradient(90deg, ${vars.background} 0 80px, ${vars["field-2"]} 80px 160px)` }}
      >
        <div className="flex flex-col gap-3 border-4 border-outline p-4" style={{ background: vars.card }}>
          <div className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- small remote logo from CFBD's CDN
              <img src={logoUrl} alt="" width={40} height={40} className="size-10 object-contain" />
            )}
            <p className="font-pixel text-[10px]" style={{ color: vars.accent }}>
              {school} colors
            </p>
          </div>
          <p className="font-pixel text-lg leading-relaxed" style={{ color: vars.primary }}>
            Picks are open
          </p>
          <p className="text-sm" style={{ color: vars["muted-foreground"] }}>
            Headings, buttons and the leader&apos;s row use these colors.
          </p>
          <span className="w-fit border-2 border-outline px-3 py-2 font-pixel text-[10px] text-black shadow-pixel-sm" style={{ background: vars.primary }}>
            Make picks ►
          </span>
        </div>
      </div>
    </section>
  );
}
