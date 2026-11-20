import Link from "next/link";
import type { Slot } from "@/lib/rules";
import type { Division, ScoredGame, SeasonLeader } from "@/lib/stats/leaders";
import type { PlayerStats } from "@/lib/stats/player-stats";

// Pieces of the player stats leaderboards, shared by the home page sidebar and /stats.

export const STAT_SLOTS: Slot[] = ["QB", "RB", "WRTE"];
export const STAT_SLOT_LABEL: Record<Slot, string> = { QB: "QB", RB: "RB", WRTE: "WR/TE" };
export const DIVISION_LABEL: Record<Division, string> = { fbs: "FBS", fcs: "FCS" };

/** The best single game at one position: "46 · Conner Weigman, Houston vs Oklahoma State, wk 7". */
export function BestGame({ slot, game }: { slot: Slot; game: ScoredGame | null }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-12 shrink-0 font-pixel text-[9px] text-muted-foreground">{STAT_SLOT_LABEL[slot]}</span>
      {game ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{game.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {game.school} vs {game.opponent} · wk {game.week}
            </div>
          </div>
          <span className="font-pixel text-sm text-primary tabular-nums">{game.points}</span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">No games yet</span>
      )}
    </div>
  );
}

/** A ranked list of season totals. */
export function LeaderList({ leaders, showDivision = false }: { leaders: SeasonLeader[]; showDivision?: boolean }) {
  if (leaders.length === 0) return <p className="py-2 text-sm text-muted-foreground">No games yet.</p>;
  return (
    <ol className="flex flex-col">
      {leaders.map((l, i) => (
        <li key={l.playerId} className="flex items-center gap-3 py-1.5">
          <span className="w-5 shrink-0 font-pixel text-[9px] text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{l.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {l.school}
              {showDivision && ` · ${DIVISION_LABEL[l.division]}`} · {l.games} {l.games === 1 ? "game" : "games"}
              {l.pickedBy > 0 && ` · picked ${l.pickedBy}×`}
            </div>
          </div>
          <span className="font-pixel text-xs text-primary tabular-nums">{l.total}</span>
        </li>
      ))}
    </ol>
  );
}

/** Home page sidebar: best game and top 3 at each position. */
export function StatsSidebar({ stats }: { stats: PlayerStats }) {
  return (
    <section className="panel flex flex-col gap-4 p-4" aria-labelledby="sidebar-stats">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sidebar-stats" className="text-xs text-primary">
          Player stats
        </h2>
        <span className="font-pixel text-[8px] text-muted-foreground">League scoring</span>
      </div>
      <div>
        <p className="font-pixel text-[9px] text-accent">Best single game</p>
        <div className="divide-y">
          {STAT_SLOTS.map((s) => (
            <BestGame key={s} slot={s} game={stats.bestGame[s]} />
          ))}
        </div>
      </div>
      {STAT_SLOTS.map((s) => (
        <div key={s}>
          <p className="font-pixel text-[9px] text-accent">Top {STAT_SLOT_LABEL[s]}s</p>
          <LeaderList leaders={stats.overall[s]} showDivision />
        </div>
      ))}
      <Link href="/stats" className="font-pixel text-[9px] text-primary">
        All player stats ►
      </Link>
    </section>
  );
}
