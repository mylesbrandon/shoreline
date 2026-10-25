"use client";
/**
 * Big DRONE | RADIO tabs with icon + label. OWNER: Developer 4.
 * Strong active states so the Navigator always knows which screen they're on.
 */
import { Radar, RadioTower } from "lucide-react";

export type NavigatorTab = "drone" | "radio";

export function NavigatorTabs({
  tab,
  onChange,
}: {
  tab: NavigatorTab;
  onChange: (tab: NavigatorTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Navigator tools" className="grid grid-cols-2 gap-2">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "drone"}
        onClick={() => onChange("drone")}
        className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 font-display text-sm font-bold uppercase tracking-[0.12em] transition active:scale-[0.98] ${
          tab === "drone"
            ? "border-cyan bg-cyan/20 text-cyan shadow-[0_0_20px_-6px_var(--color-cyan)]"
            : "border-hull bg-navy/60 text-mist"
        }`}
      >
        <Radar className="size-5 shrink-0" aria-hidden />
        <span className="leading-tight">
          Drone
          <span className="mt-0.5 block text-[9px] font-mono font-normal tracking-wider opacity-80">Land & jellies</span>
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "radio"}
        onClick={() => onChange("radio")}
        className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 font-display text-sm font-bold uppercase tracking-[0.12em] transition active:scale-[0.98] ${
          tab === "radio"
            ? "border-amber bg-amber/20 text-amber shadow-[0_0_20px_-6px_var(--color-amber)]"
            : "border-hull bg-navy/60 text-mist"
        }`}
      >
        <RadioTower className="size-5 shrink-0" aria-hidden />
        <span className="leading-tight">
          Radio
          <span className="mt-0.5 block text-[9px] font-mono font-normal tracking-wider opacity-80">Beach calls</span>
        </span>
      </button>
    </div>
  );
}
