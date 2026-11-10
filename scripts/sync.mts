// Command-line CFBD sync — the same code the /admin buttons run.
//   npm run sync -- all 2026            (teams, games, rosters, lines)
//   npm run sync -- lines               (season defaults to the current one)
//   npm run sync -- results 2026 10     (week 10 games + box scores, then scoring)
// Runs under the react-server condition so `server-only` imports resolve (see package.json).
import nextEnv from "@next/env";
import { seasonYearFor } from "@/lib/cfbd";
import { ALL_SYNC_KINDS, runSync, SYNC_KINDS, type SyncKind } from "@/lib/sync/run";

nextEnv.loadEnvConfig(process.cwd());

const [kindArg = "all", yearArg, weekArg] = process.argv.slice(2);
const year = yearArg ? Number(yearArg) : seasonYearFor(new Date());
const week = weekArg ? Number(weekArg) : undefined;
const kinds: SyncKind[] = kindArg === "all" ? [...SYNC_KINDS] : [kindArg as SyncKind];

const validKinds = kinds.every((k) => (ALL_SYNC_KINDS as readonly string[]).includes(k));
const needsWeek = kinds.includes("results") && !Number.isInteger(week);
if (!validKinds || !Number.isInteger(year) || needsWeek) {
  console.error(`Usage: npm run sync -- [all|${ALL_SYNC_KINDS.join("|")}] [year] [week, for results]`);
  process.exit(1);
}

for (const kind of kinds) {
  const started = Date.now();
  const result = await runSync(kind, year, week);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (result.ok) {
    console.log(`✓ ${kind} (${secs}s, ${result.calls} call(s), ${result.remaining ?? "?"} left)`, result.summary);
  } else {
    console.error(`✗ ${kind} (${secs}s): ${result.error}`);
    process.exit(1);
  }
}
