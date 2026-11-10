// Command-line CFBD sync — the same code the /admin buttons run.
//   npm run sync -- all 2026
//   npm run sync -- lines        (season defaults to the current one)
// Runs under the react-server condition so `server-only` imports resolve (see package.json).
import nextEnv from "@next/env";
import { seasonYearFor } from "@/lib/cfbd";
import { runSync, SYNC_KINDS, type SyncKind } from "@/lib/sync/run";

nextEnv.loadEnvConfig(process.cwd());

const [kindArg = "all", yearArg] = process.argv.slice(2);
const year = yearArg ? Number(yearArg) : seasonYearFor(new Date());
const kinds: SyncKind[] = kindArg === "all" ? [...SYNC_KINDS] : [kindArg as SyncKind];

if (!kinds.every((k) => (SYNC_KINDS as readonly string[]).includes(k)) || !Number.isInteger(year)) {
  console.error(`Usage: npm run sync -- [all|${SYNC_KINDS.join("|")}] [year]`);
  process.exit(1);
}

for (const kind of kinds) {
  const started = Date.now();
  const result = await runSync(kind, year);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (result.ok) {
    console.log(`✓ ${kind} (${secs}s, ${result.calls} call(s), ${result.remaining ?? "?"} left)`, result.summary);
  } else {
    console.error(`✗ ${kind} (${secs}s): ${result.error}`);
    process.exit(1);
  }
}
