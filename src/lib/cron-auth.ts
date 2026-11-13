import { timingSafeEqual } from "node:crypto";

/**
 * The scheduler's credential: `Authorization: Bearer <CRON_SECRET>` (sent by Supabase pg_cron via
 * pg_net, see supabase/migrations/*_scheduling.sql). Fails closed when CRON_SECRET is unset.
 * (People sign in with Supabase Auth; see src/lib/auth.ts.)
 */
export function isCronAuthorization(header: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice("Bearer ".length));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
