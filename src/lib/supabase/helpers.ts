import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/** Splits rows into batches so each upsert request stays a reasonable size. */
export function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Keeps the last item per key. Postgres rejects an upsert batch that would update the same
 * row twice ("ON CONFLICT DO UPDATE command cannot affect row a second time").
 */
export function dedupeBy<T>(items: T[], key: (item: T) => string | number): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

/** For writes that return no rows: throws on `{ error }` with context. */
export function ok(result: { error: PostgrestError | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

/** Unwraps a supabase-js result that must return data, turning `{ error }` or no data into a thrown Error. */
export function must<T>(result: { data: T; error: PostgrestError | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data returned`);
  return result.data as NonNullable<T>;
}

const PAGE = 1000; // Supabase's API returns at most 1,000 rows per request by default.

/** Reads every row of a query by paging. `page(from, to)` must apply a stable `.order()`. */
export async function selectAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = must(await page(from, from + PAGE - 1), what);
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}
