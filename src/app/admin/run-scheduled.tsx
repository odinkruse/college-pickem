"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runScheduledAction } from "./actions";

export function RunScheduledButton() {
  const [state, action, pending] = useActionState(runScheduledAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending} title="About 5–7 CFBD calls on a game week">
          {pending ? "Running…" : "Run now"}
        </Button>
      </div>
      {state && <p className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>{state.message}</p>}
    </form>
  );
}
