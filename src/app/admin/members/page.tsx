import { Suspense } from "react";
import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/helpers";
import { ActionForm } from "../action-form";
import { AdminNav } from "../admin-nav";
import { CopyButton } from "../copy-button";
import { addMemberAction, createInviteAction, setRoleAction, unlinkAction } from "../member-actions";

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
  const [membersResult, usersResult] = await Promise.all([
    db.from("league_members").select("role, sheet_tab, profiles(id, display_name, auth_user_id, invite_code), leagues!inner(slug)").eq("leagues.slug", "main"),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const members = must(membersResult, "load members").sort((a, b) => a.profiles.display_name.localeCompare(b.profiles.display_name));
  const emailOf = new Map((usersResult.data?.users ?? []).map((u) => [u.id, u.email ?? u.phone ?? "signed in"]));
  const linked = members.filter((m) => m.profiles.auth_user_id).length;

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} members · {linked} signed in. Send each person their own invite link: they sign in (Google or an emailed code),
          then the link ties that login to their entry. Each link works once.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {members.map((m) => {
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
                {!p.auth_user_id && p.invite_code && (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{`${origin}/join/${p.invite_code}`}</code>
                    <CopyButton text={`${origin}/join/${p.invite_code}`} />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

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
