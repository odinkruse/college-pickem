import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthClient } from "@/lib/supabase/server";

const LEAGUE_SLUG = "main";

export type Viewer = {
  userId: string;
  email: string | null;
  /** The league profile this login has claimed (via an invite link), if any. */
  profileId: string | null;
  displayName: string | null;
  role: "owner" | "admin" | "member" | null;
  isAdmin: boolean;
};

/**
 * Who is making this request, or null if signed out. `getClaims()` verifies the session JWT in the
 * cookie (with Supabase's signing keys), so the result can be trusted. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const db = createAdminClient();
  const profile = (
    await db
      .from("profiles")
      .select("id, display_name, league_members(role, leagues!inner(slug))")
      .eq("auth_user_id", claims.sub)
      .eq("league_members.leagues.slug", LEAGUE_SLUG)
      .maybeSingle()
  ).data;
  const role = (profile?.league_members[0]?.role ?? null) as Viewer["role"];
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    profileId: profile?.id ?? null,
    displayName: profile?.display_name ?? null,
    role,
    isAdmin: role === "owner" || role === "admin",
  };
});

export class AuthError extends Error {}

/** For Server Actions: a signed-in member with a claimed profile. */
export async function requireMember(): Promise<Viewer & { profileId: string }> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError("Please sign in.");
  if (!viewer.profileId) throw new AuthError("Your login isn't linked to a league entry yet. Use your invite link.");
  return viewer as Viewer & { profileId: string };
}

/** For admin Server Actions and pages: the owner or a league admin. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new AuthError("Admins only.");
  return viewer;
}

/** Only same-site paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: unknown, fallback = "/picks"): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
