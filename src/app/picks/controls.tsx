"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Slot, WeekRule } from "@/lib/rules";
import { removePickAction, setWeekRuleAction } from "./actions";
import { RULE_LABEL } from "./format";

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
export function WeekRuleSelect({ year, week, rule }: { year: number; week: number; rule: WeekRule }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Week type"
      value={rule}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as WeekRule;
        start(() => setWeekRuleAction(year, week, next));
      }}
      className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
    >
      {(Object.keys(RULE_LABEL) as WeekRule[]).map((r) => (
        <option key={r} value={r}>
          {RULE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
