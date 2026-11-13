// Imports the league's picks from its Google Sheet (see src/lib/import/).
//   npm run import -- 2026            import every week and score
//   npm run import -- 2026 --dry      match only; report what would happen, write nothing
//   npm run import -- 2026 10         just week 10
import nextEnv from "@next/env";
import { importLeaguePicks, runImport, type ImportIssue } from "@/lib/import/league-import";
import { createAdminClient } from "@/lib/supabase/admin";

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const [year, ...weeks] = args.filter((a) => a !== "--dry").map(Number);
if (!Number.isInteger(year)) throw new Error("Usage: npm run import -- <year> [week ...] [--dry]");

const started = Date.now();
const db = createAdminClient();
const opts = { weeks: weeks.length ? weeks : undefined, dryRun };
// Real runs go through runImport so they're logged in sync_runs and show on /admin/import.
const result = dryRun ? { ok: true as const, summary: await importLeaguePicks(db, year, opts) } : await runImport(db, year, opts.weeks);
if (!result.ok) throw new Error(result.error);
const s = result.summary;
const list = (title: string, items: ImportIssue[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const i of items) {
    const hint = i.suggestions?.length ? ` Closest: ${i.suggestions.map((x) => x.label).join(", ")}.` : "";
    console.log(`  ${i.member} wk${i.week} ${i.slot}: "${i.text}" ${i.problem}${hint}`);
  }
};
console.log(
  `${dryRun ? "DRY RUN · " : ""}${s.members} members (${s.newMembers.length} new) · ${s.cells} cells · ${s.matched} matched · ` +
    `${s.inserted} inserted, ${s.updated} updated, ${s.unchanged} unchanged · ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
if (s.skippedRows.length) console.log(`\nSkipped rows (${s.skippedRows.length})\n  ${s.skippedRows.join("\n  ")}`);
list("Unresolved", s.unresolved);
list("Refused by the database", s.errors);
list("Loose matches", s.loose);
list("Rule warnings", s.ruleWarnings);
