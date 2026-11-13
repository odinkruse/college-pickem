"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { claimInviteAction } from "./actions";

export function ClaimButton({ code, name }: { code: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} onClick={() => start(async () => setError((await claimInviteAction(code)).error))}>
        {pending ? "Linking…" : `I'm ${name}`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
