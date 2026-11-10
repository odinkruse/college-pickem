"use client";

import { useSyncExternalStore } from "react";

// Times are shown in the viewer's own timezone, which only the browser knows. The server renders
// nothing for them (getServerSnapshot → null) and the browser fills them in, which avoids a
// server/browser mismatch. The clock ticks every 30 s so countdowns stay current.

const TICK_MS = 30_000;
const subscribe = (onChange: () => void) => {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
};
const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const kickoffFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

function countdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(minutes, 1)}m`;
}

/** "Sat 3:30 PM · locks in 2d 4h", or "Locked Sat 3:30 PM" once past. */
export function LockTime({ lockAt, className }: { lockAt: string; className?: string }) {
  const now = useNow();
  if (now === null) return <span className={className}>&nbsp;</span>;
  const at = new Date(lockAt);
  const label = kickoffFormat.format(at);
  const remaining = at.getTime() - now;
  return (
    <span className={className}>
      {remaining <= 0 ? `Locked ${label}` : `${label} · locks in ${countdown(remaining)}`}
    </span>
  );
}
