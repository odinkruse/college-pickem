import Link from "next/link";
import type { StandingsRow } from "@/lib/standings";

/** Rank / name / total / slot totals / latest week. Names link to each entry's pick history. */
export function StandingsTable({ rows, lastWeek }: { rows: StandingsRow[]; lastWeek?: number }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-2 pr-2 font-normal">#</th>
          <th className="py-2 pr-2 font-normal">Name</th>
          <th className="py-2 pr-2 text-right font-normal">Total</th>
          <th className="py-2 pr-2 text-right font-normal">QB</th>
          <th className="py-2 pr-2 text-right font-normal">RB</th>
          <th className="py-2 pr-2 text-right font-normal">WR/TE</th>
          {lastWeek !== undefined && <th className="py-2 text-right font-normal">Wk {lastWeek}</th>}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.entryId}>
            <td className="py-2 pr-2 text-muted-foreground">{r.rank}</td>
            <td className="py-2 pr-2">
              <Link href={`/standings/${r.entryId}`} className="font-medium hover:underline">
                {r.name}
              </Link>
            </td>
            <td className="py-2 pr-2 text-right font-semibold">{r.total}</td>
            <td className="py-2 pr-2 text-right">{r.bySlot.QB}</td>
            <td className="py-2 pr-2 text-right">{r.bySlot.RB}</td>
            <td className="py-2 pr-2 text-right">{r.bySlot.WRTE}</td>
            {lastWeek !== undefined && <td className="py-2 text-right">{r.byWeek.get(lastWeek) ?? "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
