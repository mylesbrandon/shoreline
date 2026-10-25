"use client";
/**
 * DRONE | RADIO segmented control for the Navigator. OWNER: Developer 4.
 */

export type NavigatorTab = "drone" | "radio";

export function NavigatorTabs({
  tab,
  onChange,
  accentClass,
}: {
  tab: NavigatorTab;
  onChange: (tab: NavigatorTab) => void;
  /** Team accent text/border classes, e.g. text-team-blue border-team-blue */
  accentClass: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Navigator tools"
      className="grid h-12 min-h-11 grid-cols-2 overflow-hidden rounded-xl border border-hull font-display text-sm font-semibold uppercase tracking-[0.22em]"
    >
      {(
        [
          ["drone", "Drone"],
          ["radio", "Radio"],
        ] as const
      ).map(([id, label]) => {
        const selected = tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={selected ? `bg-navy ${accentClass} border-b-2` : "bg-deep/40 text-mist"}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
