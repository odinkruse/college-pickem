@AGENTS.md

# College Pick'em

Read [docs/PLAN.md](docs/PLAN.md) first: game rules, data-model decisions, CFBD findings, phase status.

- Stack: Next.js 16 App Router (Cache Components on), TypeScript, Tailwind 4, shadcn/ui (base-nova),
  Supabase (hosted project, no local Docker stack), Vercel.
- Owner is an experienced full-stack dev who is new to Next.js, Supabase and Vercel: explain
  framework-specific concepts briefly when introducing them.
- Server-only code imports `server-only`. The Supabase secret key is used only via
  `src/lib/supabase/admin.ts`.
- CFBD calls cost quota (1,000/month free tier). Prefer bulk year+week+classification endpoints and
  persist results; never call CFBD per page view without `use cache`.
- Schema changes go in `supabase/migrations/` via `supabase migration new`, applied with `supabase db push`.
