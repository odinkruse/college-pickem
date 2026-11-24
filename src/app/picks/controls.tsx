"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Slot } from "@/lib/rules";
import { removePickAction } from "./actions";

export function RemovePickButton({ year, week, slot }: { year: number; week: number; slot: Slot }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await removePickAction(year, week, slot);
            setError(result.ok ? null : result.errors.join(" "));
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}

/** League-wide week type. Only the owner uses the app in Phase 1, so it lives on the picks page. */
