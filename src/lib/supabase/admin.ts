import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Server-only Supabase client authenticated with the secret key.
 *
 * The secret key bypasses Row Level Security, so this module must never be imported
 * into a Client Component (the `server-only` import above makes that a build error).
 * Phase 1 has no login, so all database access goes through this client from
 * Server Components, Server Actions and Route Handlers. When auth arrives, user-facing
 * reads move to a per-request client built with @supabase/ssr and the publishable key.
 */
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
