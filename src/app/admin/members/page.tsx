import { Suspense } from "react";
import { currentSeasonYear } from "@/lib/season";
import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getViewer } from "@/lib/auth";
import { loadTeamOptions } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { CopyButton } from "../copy-button";
import { addMemberAction, createInviteAction, setMemberDetailsAction, setRoleAction, unlinkAction } from "../member-actions";

// League members: who has signed in, invite links for those who haven't, and admin roles.
export default function MembersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AdminNav active="/admin/members" />
      <Suspense fallback={<p className="text-muted-foreground">Loading members…</p>}>
        <Members />
      </Suspense>
    </main>
  );
}

async function Members() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const viewer = await getViewer();
  const db = createAdminClient();
  const [membersResult, usersResult, year] = await Promise.all([
    db
      .from("league_members")
      .select("role, sheet_tab, profiles(id, display_name, auth_user_id, invite_code, contact_email, phone, teams(school), entries(seasons(year))), leagues!inner(slug)")
      .eq("leagues.slug", "main"),
    db.auth.admin.listUsers({ perPage: 1000 }),
    currentSeasonYear(db),
  ]);
  const teamOptions = await loadTeamOptions(year);
  const members = must(membersResult, "load members").sort((a, b) => a.profiles.display_name.localeCompare(b.profiles.display_name));
  const emailOf = new Map((usersResult.data?.users ?? []).map((u) => [u.id, u.email ?? u.phone ?? "signed in"]));
  const linked = members.filter((m) => m.profiles.auth_user_id).length;
  const playing = (m: (typeof members)[number]) => m.profiles.entries.some((e) => e.seasons.year === year);
  const current = members.filter(playing);
  const former = members.filter((m) => !playing(m));

  const renderRow = (m: (typeof members)[number]) => {
            const p = m.profiles;
            const isSelf = p.id === viewer?.profileId;
            return (
              <div key={p.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{p.display_name}</span>
                    {m.role !== "member" && (
                      <Badge variant="secondary" className="ml-2">
                        {m.role}
                      </Badge>
                    )}
                    {!m.sheet_tab && (
                      <Badge variant="outline" className="ml-2">
                        not in sheet
                      </Badge>
                    )}
                    <div className="text-muted-foreground">{p.auth_user_id ? emailOf.get(p.auth_user_id) ?? "signed in" : "not signed in yet"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.role !== "owner" && (
                      <ActionForm action={setRoleAction}>
                        <input type="hidden" name="profile" value={p.id} />
                        <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                        <Button type="submit" size="sm" variant="ghost">
                          {m.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                      </ActionForm>
                    )}
                    {p.auth_user_id && !isSelf && (
                      <ActionForm action={unlinkAction}>
                        <input type="hidden" name="profile" value={p.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Unlink login
                        </Button>
                      </ActionForm>
                    )}
                    {!p.auth_user_id && (
                      <ActionForm action={createInviteAction}>
                        <input type="hidden" name="profile" value={p.id} />
                        <Button type="submit" size="sm" variant="outline">
                          {p.invite_code ? "New link" : "Create invite link"}
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                </div>
                <ActionForm action={setMemberDetailsAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="profile" value={p.id} />
                  <Input
                    name="team"
                    list="team-options"
                    defaultValue={p.teams?.school ?? ""}
                    placeholder="Favorite team"
                    aria-label={`${p.display_name}'s favorite team`}
                    className="h-8 w-44"
                  />
                  <Input
                    name="email"
                    type="email"
                    defaultValue={p.contact_email ?? ""}
                    placeholder="Contact email"
                    aria-label={`${p.display_name}'s contact email`}
                    className="h-8 w-52 min-w-0 flex-1"
                  />
                  <Input name="phone" type="tel" defaultValue={p.phone ?? ""} placeholder="Phone" aria-label={`${p.display_name}'s phone`} className="h-8 w-32" />
                  <Button type="submit" size="xs" variant="outline">
                    Save
                  </Button>
                </ActionForm>
                {!p.auth_user_id && p.invite_code && (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{`${origin}/join/${p.invite_code}`}</code>
                    <CopyButton text={`${origin}/join/${p.invite_code}`} />
                  </div>
                )}
              </div>
            );
  };

  return (
    <>
      <header>
        <h1 className="text-xl sm:text-2xl">Members</h1>
        <p className="text-sm text-muted-foreground">
          {current.length} playing in {year} · {linked} signed in. Send each person their own invite link: they sign in (Google or an emailed code),
          then the link ties that login to their entry. Each link works once. Favorite teams decide the champion&apos;s colors; members can
          also set their own under My team.
        </p>
      </header>

      <datalist id="team-options">
        {teamOptions.map((t) => (
          <option key={t.id} value={t.school} />
        ))}
      </datalist>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {current.map(renderRow)}
        </CardContent>
      </Card>

      {former.length > 0 && (
        <details className="panel">
          <summary className="cursor-pointer p-4 font-pixel text-[10px] text-primary">
            Former members ({former.length}): not playing in {year}
          </summary>
          <div className="flex flex-col divide-y border-t-4 border-outline px-4">{former.map(renderRow)}</div>
        </details>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a member</CardTitle>
          <CardDescription>Only for someone who isn&apos;t in the league sheet. New sheet tabs become members automatically on import.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addMemberAction} className="flex flex-wrap items-center gap-2">
            <Input name="name" placeholder="Name as shown in standings" aria-label="Name" className="w-56" required />
            <Button type="submit" size="sm">
              Add
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
