const YARDS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

/** Decorative strip of yard-line numbers between sections. */
export function YardLines() {
  return (
    <div aria-hidden="true" className="grid grid-cols-9 border-4 border-white">
      {YARDS.map((y, i) => (
        <div key={i} className="border-l-[3px] border-white/85 py-2 text-center font-pixel text-[9px] text-white first:border-l-0 sm:text-xs">
          {y}
        </div>
      ))}
    </div>
  );
}
