"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { seasonYearFor } from "@/lib/cfbd";
import { createAdminClient } from "@/lib/supabase/admin";
import { must, ok } from "@/lib/supabase/helpers";
import type { FormState } from "./override-actions";

const LEAGUE_SLUG = "main";

async function leagueId(db: ReturnType<typeof createAdminClient>) {
  return must(await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single(), "load league").id;
}

function done(message: string): FormState {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** A fresh one-time invite code for an unlinked member (replaces any previous code). */
export async function createInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await requireAdmin();
    const code = randomBytes(12).toString("base64url");
    const { data } = await createAdminClient()
      .from("profiles")
      .update({ invite_code: code })
      .eq("id", String(form.get("profile")))
      .is("auth_user_id", null)
      .select("id");
    if (!data?.length) throw new Error("That member is already linked to a login.");
    return done("Invite link created.");
  });
}

/** Disconnects a login from a member (e.g. they signed in with the wrong account). Picks stay. */
export async function unlinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const viewer = await requireAdmin();
    const profileId = String(form.get("profile"));
    if (profileId === viewer.profileId) throw new Error("You can't unlink yourself.");
    ok(await createAdminClient().from("profiles").update({ auth_user_id: null }).eq("id", profileId), "unlink");
    return done("Unlinked. Send them a new invite link.");
  });
}

export async function setRoleAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await requireAdmin();
    const role = String(form.get("role"));
    if (role !== "admin" && role !== "member") throw new Error("Invalid role.");
    const db = createAdminClient();
    const { data } = await db
      .from("league_members")
      .update({ role })
      .eq("league_id", await leagueId(db))
      .eq("profile_id", String(form.get("profile")))
      .neq("role", "owner")
      .select("profile_id");
    if (!data?.length) throw new Error("The owner's role can't be changed.");
    return done(role === "admin" ? "Now an admin." : "Now a regular member.");
  });
}

/** A member who isn't in the league sheet (picks only in the app). Sheet tabs become members on import. */
export async function addMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await requireAdmin();
    const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) throw new Error("Enter a name (2–40 characters).");
    const db = createAdminClient();
    const league = await leagueId(db);
    const season = must(await db.from("seasons").select("id").eq("year", seasonYearFor(new Date())).single(), "load season");
    const profile = must(await db.from("profiles").insert({ display_name: name }).select("id").single(), "add profile");
    ok(await db.from("league_members").insert({ league_id: league, profile_id: profile.id }), "add to league");
    ok(await db.from("entries").insert({ league_id: league, season_id: season.id, profile_id: profile.id }), "create entry");
    return done(`Added ${name}. Create an invite link for them below.`);
  });
}
