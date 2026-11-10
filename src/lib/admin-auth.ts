import { timingSafeEqual } from "node:crypto";

/**
 * Phase 1 admin protection: HTTP Basic auth with a single shared password (ADMIN_PASSWORD;
 * any username). Replaced by real Supabase Auth roles in the multi-user phase.
 *
 * Used in two places, deliberately:
 *   - src/proxy.ts gates every /admin request (pages and the Server Actions they post to).
 *   - each admin Server Action re-checks, because an action can be invoked by a POST that
 *     doesn't go through the /admin URL.
 * Fails closed: if ADMIN_PASSWORD is unset, nobody is admin.
 */
export function isAdminAuthorization(header: string | null): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(":") + 1);

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
