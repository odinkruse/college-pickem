"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LockTime } from "@/components/time";
import type { CandidateResult } from "@/lib/picks/service";
import type { Slot } from "@/lib/rules";
import { savePickAction, searchPlayersAction } from "./actions";
import { formatSpread, SLOT_LABEL } from "./format";

type Props = { year: number; week: number; slot: Slot; triggerLabel: string; showSpread: boolean };

export function PickDialog({ year, week, slot, triggerLabel, showSpread }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CandidateResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0); // ignores responses that arrive after a newer search started

  function onQueryChange(value: string) {
    setQuery(value);
    setErrors([]);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const id = ++latest.current;
      try {
        const found = await searchPlayersAction(year, week, slot, value);
        if (id === latest.current) setResults(found);
      } catch (e) {
        if (id === latest.current) setErrors([e instanceof Error ? e.message : "Search failed"]);
      } finally {
        if (id === latest.current) setSearching(false);
      }
    }, 250);
  }

  function choose(playerId: number) {
    startSaving(async () => {
      const result = await savePickAction(year, week, slot, playerId);
      if (result.ok) {
        setOpen(false);
        setQuery("");
        setResults(null);
      } else {
        setErrors(result.errors);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerLabel === "Pick" ? "default" : "outline"} size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Week {week} {SLOT_LABEL[slot]}
          </DialogTitle>
          <DialogDescription>Search by player or team. Players who can&apos;t be picked are greyed out with the reason.</DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          placeholder="e.g. Sayin, or Ohio State"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={saving}
        />

        {errors.length > 0 && (
          <ul className="text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="-mx-1 min-h-24 overflow-y-auto">
          {searching && <p className="px-1 text-sm text-muted-foreground">Searching…</p>}
          {!searching && results?.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">No {SLOT_LABEL[slot]}s playing this week match &ldquo;{query}&rdquo;.</p>
          )}
          {!searching && results && results.length > 0 && (
            <ul className="flex flex-col">
              {results.map((r) => {
                const eligible = r.violations.length === 0;
                return (
                  <li key={r.playerId}>
                    <button
                      type="button"
                      disabled={!eligible || saving}
                      onClick={() => choose(r.playerId)}
                      className="w-full rounded-md px-2 py-2 text-left enabled:hover:bg-muted disabled:cursor-not-allowed"
                    >
                      <div className={`flex items-baseline justify-between gap-2 ${eligible ? "" : "opacity-50"}`}>
                        <span className="font-medium">
                          {r.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            {r.position}
                            {r.jersey !== null && ` #${r.jersey}`}
                          </span>
                        </span>
                        {showSpread && <span className="text-xs tabular-nums text-muted-foreground">{formatSpread(r.teamSpread)}</span>}
                      </div>
                      <div className={`text-xs text-muted-foreground ${eligible ? "" : "opacity-50"}`}>
                        {r.team.school} {r.isHome ? "vs" : "@"} {r.opponent.school} · <LockTime lockAt={r.lockAt} />
                      </div>
                      {!eligible && <div className="text-xs text-destructive">{r.violations.map((v) => v.message).join(" ")}</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
