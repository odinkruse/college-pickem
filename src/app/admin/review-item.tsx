"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolveReviewAction } from "./actions";

/** The two answers to "no box-score line: did he play?" */
export function ReviewButtons({ pickId }: { pickId: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (played: boolean) =>
    start(async () => {
      const result = await resolveReviewAction(pickId, played);
      setError(result.ok ? null : (result.error ?? "Failed"));
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => answer(false)} title="Releases him to be picked again">
          Didn&apos;t play
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => answer(true)} title="Keeps him used, 0 points">
          Played
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
