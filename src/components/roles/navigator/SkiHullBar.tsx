"use client";
/**
 * Compact ski hull readout for the Navigator (both tabs). OWNER: Developer 4.
 * Hull only drops from jellyfish in versus — land runs you aground without damage.
 */

export function SkiHullBar({ hull }: { hull: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(hull)));
  const critical = pct <= 25;
  return (
    <div className="grid gap-1" aria-label={`Ski hull ${pct} percent`}>
      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="text-mist">Ski hull — jellies only</span>
        <span className={critical ? "text-hazard" : "text-teal"}>{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-hull bg-abyss">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${critical ? "bg-hazard" : "bg-teal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
