import { after } from "next/server";
import { isCronAuthorization } from "@/lib/cron-auth";
import { runScheduled, SCHEDULED_JOBS, type ScheduledJob } from "@/lib/scheduled";

// Called by Supabase pg_cron (via pg_net) on a schedule: POST /api/cron?job=daily|gameday with
// `Authorization: Bearer <CRON_SECRET>`. Replies 202 at once and does the work after the response
// (`after`), so the database's HTTP call never waits on CFBD. Results land in sync_runs.

// Vercel's limit for this function, including the `after` work (Hobby allows up to 300 s).
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isCronAuthorization(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const job = new URL(request.url).searchParams.get("job") as ScheduledJob;
  if (!SCHEDULED_JOBS.includes(job)) {
    return Response.json({ error: `job must be one of ${SCHEDULED_JOBS.join(", ")}` }, { status: 400 });
  }
  after(() => runScheduled(job));
  return Response.json({ accepted: true, job }, { status: 202 });
}
