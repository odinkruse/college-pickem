import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

/**
 * Supabase client for *authentication only* (who is signed in), using the publishable key and the
 * request's cookies. Data access stays on the secret-key admin client, always scoped in code to the
 * signed-in member. Works in Server Components (read-only cookies), Server Actions and Route Handlers.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session on every request instead.
        }
      },
    },
  });
}
