import { RULE_HINT, RULE_LABEL } from "@/app/picks/format";
import type { WeekRule } from "@/lib/rules";

// Banners for the league's gimmick weeks, each with a small pixel-art icon. Icons are drawn from
// text grids: "#" is the theme's highlight color, "+" is white, "." is empty.

const ICONS: Record<Exclude<WeekRule, "standard">, string[]> = {
  championship: [
    "..############..",
    ".#.##########.#.",
    "#..###+######..#",
    "#..###+######..#",
    ".#.###+######.#.",
    "..############..",
    "...##########...",
    ".....######.....",
    "......####......",
    "......####......",
    ".....######.....",
    "...##########...",
    "...##########...",
  ],
  underdog: [
    "..........##....",
    ".........###....",
    ".........#####..",
    "#........##+####",
    "#........#####..",
    ".#.......####...",
    "..#########.....",
    "..#########.....",
    "..#########.....",
    "..##.....##.....",
    "..##.....##.....",
    "..##.....##.....",
    ".###....###.....",
  ],
  conference: [
    ".....######.....",
    "...##########...",
    ".####+#+#+#+###.",
    "####++++++++####",
    ".####+#+#+#+###.",
    "...##########...",
    ".....######.....",
  ],
};

export function PixelIcon({ rows, size = 4, label }: { rows: string[]; size?: number; label: string }) {
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <svg
      role="img"
      aria-label={label}
      width={width * size}
      height={rows.length * size}
      viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges"
      className="shrink-0 text-primary"
    >
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={cell === "+" ? "#ffffff" : "currentColor"} />
          ),
        ),
      )}
    </svg>
  );
}

/** "Week 14 · Championship week" with its icon and rule, or nothing for a standard week. */
export function SpecialWeekBanner({ rule, week }: { rule: WeekRule; week: number }) {
  if (rule === "standard") return null;
  return (
    <section className="panel flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
      <PixelIcon rows={ICONS[rule]} label={RULE_LABEL[rule]} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-pixel text-[9px] text-accent">Week {week}</p>
        <h2 className="text-sm text-primary sm:text-base">{RULE_LABEL[rule]}</h2>
        <p className="text-sm text-muted-foreground">{RULE_HINT[rule]}</p>
      </div>
    </section>
  );
}
