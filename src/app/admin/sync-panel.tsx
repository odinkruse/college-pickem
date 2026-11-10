"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { syncAction, type SyncActionState } from "./actions";

const SEASON_BUTTONS = [
  { kind: "all", label: "Sync everything", calls: 5 },
  { kind: "teams", label: "Teams", calls: 1 },
  { kind: "games", label: "Games", calls: 2 },
  { kind: "rosters", label: "Rosters", calls: 1 },
  { kind: "lines", label: "Lines", calls: 1 },
] as const;

// A Client Component: it needs browser-side state (pending spinner, last result).
// The form posts to the syncAction Server Action; the clicked button's name/value says which sync.
export function SyncPanel({ season, weeks, currentWeek }: { season: number; weeks: number[]; currentWeek: number }) {
  const [state, formAction, pending] = useActionState<SyncActionState, FormData>(syncAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="season" value={season} />

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Weekly results</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            name="week"
            defaultValue={currentWeek}
            aria-label="Week"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            disabled={pending}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
          <Button type="submit" name="kind" value="results" disabled={pending} title="4 CFBD calls">
            Sync results &amp; score
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Final scores and box scores for that week, then every pick is scored. 4 CFBD calls. Re-run after stat corrections.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Season data</div>
        <div className="flex flex-wrap gap-2">
          {SEASON_BUTTONS.map((b) => (
            <Button
              key={b.kind}
              type="submit"
              name="kind"
              value={b.kind}
              variant="outline"
              disabled={pending}
              title={`${b.calls} CFBD call${b.calls > 1 ? "s" : ""}`}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          First time: &ldquo;Sync everything&rdquo; (teams → games → rosters → lines). Re-sync lines before an underdog week.
        </p>
      </div>

      {pending && <p className="text-sm">Syncing… this can take up to half a minute.</p>}
      {state && !pending && (
        <ul className={`text-sm ${state.ok ? "" : "text-destructive"}`}>
          {state.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
