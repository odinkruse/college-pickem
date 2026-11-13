"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createAuthClient } from "@/lib/supabase/server";

export type EmailState = { step: "email" | "code"; email: string; error?: string };

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Starts Google sign-in: Supabase returns Google's consent URL; Google comes back to /auth/callback. */
export async function googleSignInAction(form: FormData) {
  const next = safeNext(form.get("next"));
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  redirect(data.url);
}

/**
 * Email sign-in in two steps on one form: "send" emails a 6-digit code (creating the login if new),
 * "verify" checks it and signs in. A code rather than a link, so it works even when the email opens
 * in a different browser or app than the one signing in.
 */
export async function emailSignInAction(prev: EmailState, form: FormData): Promise<EmailState> {
  const next = safeNext(form.get("next"));
  const supabase = await createAuthClient();
  const email = String(form.get("email") ?? prev.email).trim().toLowerCase();

  if (form.get("op") === "verify") {
    const token = String(form.get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email." };
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, error: "That code didn't work. It may have expired; send a new one." };
    redirect(next);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { step: "email", email, error: "Enter a valid email address." };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { step: "email", email, error: error.message };
  return { step: "code", email };
}

export async function signOutAction() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/");
}
