"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { syncAction, type SyncActionState } from "./actions";

const BUTTONS = [
  { kind: "all", label: "Sync everything", calls: 5 },
  { kind: "teams", label: "Teams", calls: 1 },
  { kind: "games", label: "Games", calls: 2 },
  { kind: "rosters", label: "Rosters", calls: 1 },
  { kind: "lines", label: "Lines", calls: 1 },
] as const;

// A Client Component: it needs browser-side state (pending spinner, last result).
// The form posts to the syncAction Server Action; the clicked button's name/value says which sync.
export function SyncPanel({ season }: { season: number }) {
  const [state, formAction, pending] = useActionState<SyncActionState, FormData>(syncAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="season" value={season} />
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <Button
            key={b.kind}
            type="submit"
            name="kind"
            value={b.kind}
            variant={b.kind === "all" ? "default" : "outline"}
            disabled={pending}
            title={`${b.calls} CFBD call${b.calls > 1 ? "s" : ""}`}
          >
            {b.label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Run order matters the first time: teams → games → rosters → lines. &ldquo;Sync everything&rdquo; does that.
      </p>
      {pending && <p className="text-sm">Syncing… rosters take up to half a minute.</p>}
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
