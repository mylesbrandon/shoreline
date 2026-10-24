"use client";
/**
 * Big-screen view for the host laptop / judges. OWNER: Developer 3.
 * Reuses OceanCanvas. TODO(dev3): hull bar, event toasts (HAZARD_HIT shake), victory/failure overlay.
 */
import type { SpectatorView } from "@/game/types";
import { MissionClock } from "@/components/shared/MissionClock";
import { OceanCanvas } from "./OceanCanvas";

export function SpectatorDisplay({ view }: { view: SpectatorView }) {
  return (
    <div className="relative w-full">
      <OceanCanvas
        boat={view.boat}
        hazards={view.hazards}
        markers={view.markers}
        target={view.target}
        current={view.weather.current}
        stormIntensity={view.weather.stormIntensity}
        className="instrument"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span className="rounded-md bg-abyss/70 px-2 py-1 font-mono text-xs uppercase tracking-widest text-mist">
          {view.mission.phase}
        </span>
        <MissionClock mission={view.mission} className="rounded-md bg-abyss/70 px-3 py-1 text-2xl" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-abyss/70">
          <div className="h-full bg-teal transition-[width]" style={{ width: `${view.boat.hull}%` }} />
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-mist">Hull {Math.round(view.boat.hull)}%</p>
      </div>
    </div>
  );
}
