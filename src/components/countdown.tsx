"use client";

import { useEffect, useState } from "react";

const MINUTE = 60_000;

/** Days / hours / minutes until `target`, in scoreboard digits. Ticks every 30 s. */
export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, new Date(target).getTime() - now);
  const minutes = Math.floor(left / MINUTE);
  const parts: [string, number][] = [
    ["Days", Math.floor(minutes / 1440)],
    ["Hrs", Math.floor((minutes % 1440) / 60)],
    ["Min", minutes % 60],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 text-center" role="timer" aria-label="Time until next kickoff">
      {parts.map(([label, value]) => (
        <div key={label} className="border-[3px] border-muted-foreground/60 bg-black px-1 py-2.5">
          <div className="font-pixel text-xl text-primary tabular-nums" suppressHydrationWarning>
            {String(value).padStart(2, "0")}
          </div>
          <div className="mt-1.5 font-pixel text-[8px] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}
