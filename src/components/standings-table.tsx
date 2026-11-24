import Link from "next/link";
import type { StandingsRow } from "@/lib/standings";

/**
 * Rank / name / total / slot totals / latest week, scoreboard style: the leader's row is lit up and
 * the signed-in member's row is marked. Names link to each entry's pick history.
 * `phoneRows`: below the lg breakpoint, show only the first n rows (plus the member's own row).
 * `stickyHeader`: the table scrolls inside its container (lg and up): headings stay at the top and the
 * member's own row stays at the bottom until it scrolls into view.
 */
export function StandingsTable({
  rows,
  lastWeek,
  youProfileId,
  phoneRows,
  stickyHeader,
}: {
  rows: StandingsRow[];
  lastWeek?: number;
  youProfileId?: string | null;
  phoneRows?: number;
  stickyHeader?: boolean;
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className={`text-left font-pixel text-[9px] text-muted-foreground ${stickyHeader ? "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card" : ""}`}>
        <tr>
          <th className="py-2 pr-2 pl-3 font-normal">#</th>
          <th className="py-2 pr-2 font-normal">Name</th>
          <th className="py-2 pr-2 text-right font-normal">Total</th>
          <th className="hidden py-2 pr-2 text-right font-normal sm:table-cell">QB</th>
          <th className="hidden py-2 pr-2 text-right font-normal sm:table-cell">RB</th>
          <th className="hidden py-2 pr-2 text-right font-normal sm:table-cell">WR/TE</th>
          {lastWeek !== undefined && <th className="py-2 pr-3 text-right font-normal">Wk {lastWeek}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const leader = r.rank === 1;
          const you = !!youProfileId && r.profileId === youProfileId;
          const belowTop = phoneRows !== undefined && i >= phoneRows;
          // Phones: rows past the top n are hidden, except your own, set off with a rule.
          const phone = belowTop ? (you ? "max-lg:[&>td]:border-t-2 max-lg:[&>td]:border-dashed max-lg:[&>td]:border-muted-foreground" : "max-lg:hidden") : "";
          // Desktop, scrolling inside the card: your row stays pinned to the bottom until you scroll to it.
          const pinned = you && !leader && stickyHeader ? "lg:[&>td]:sticky lg:[&>td]:bottom-0 lg:[&>td]:bg-black" : "";
          const rowClass = `${leader ? "bg-primary text-primary-foreground" : you ? "bg-black" : i % 2 ? "bg-muted/60" : ""} ${phone} ${pinned}`;
          return (
            <tr key={r.entryId} className={rowClass}>
              <td className="py-2.5 pr-2 pl-3 font-pixel text-[11px]">{String(r.rank).padStart(2, "0")}</td>
              <td className="py-2.5 pr-2 font-semibold">
                <Link href={`/standings/${r.entryId}`} className="no-underline hover:underline">
                  {r.name}
                </Link>
                {you && <span className="ml-2 bg-accent px-1.5 py-1 font-pixel text-[8px] text-accent-foreground">You</span>}
              </td>
              <td className="py-2.5 pr-2 text-right font-pixel text-xs">{r.total}</td>
              <td className="hidden py-2.5 pr-2 text-right sm:table-cell">{r.bySlot.QB}</td>
              <td className="hidden py-2.5 pr-2 text-right sm:table-cell">{r.bySlot.RB}</td>
              <td className="hidden py-2.5 pr-2 text-right sm:table-cell">{r.bySlot.WRTE}</td>
              {lastWeek !== undefined && <td className="py-2.5 pr-3 text-right">{r.byWeek.get(lastWeek) ?? "–"}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
