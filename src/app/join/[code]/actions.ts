"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Links the signed-in login to the invited profile. One-time: the code is cleared on success. */
export async function claimInviteAction(code: string): Promise<{ error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in first." };
  if (viewer.profileId) return { error: `This login is already linked to ${viewer.displayName}.` };

  const { data } = await createAdminClient()
    .from("profiles")
    .update({ auth_user_id: viewer.userId, invite_code: null })
    .eq("invite_code", String(code))
    .is("auth_user_id", null)
    .select("id");
  if (!data?.length) return { error: "That invite link has already been used or isn't valid. Ask for a new one." };
  redirect("/picks");
}
