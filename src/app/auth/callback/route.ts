import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth";
import { createAuthClient } from "@/lib/supabase/server";

// Where Google sign-in lands: trade the one-time ?code for a session (stored in cookies), then go on.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const message = url.searchParams.get("error_description") ?? "Sign-in didn't complete. Try again.";
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`, url.origin));
}
