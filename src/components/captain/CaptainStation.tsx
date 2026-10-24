"use client";
import type { CaptainView, PlayerAction } from "@/game/types";
import { OceanCanvas } from "@/components/ocean/OceanCanvas";
import { CAPTAIN } from "@/game/config";
import { CaptainControls } from "./CaptainControls";

/** 0.24 map-widths across; the clear circle is the lookout range. */
const CAPTAIN_WINDOW = { span: 0.24, lookout: CAPTAIN.visualRange } as const;

export interface CaptainStationProps {
  view: CaptainView;
  onAction: (action: PlayerAction) => void;
}

export function CaptainStation({ view, onAction }: CaptainStationProps) {
  return <div className="grid gap-3">
    <div className="relative mx-auto w-full sm:max-w-[min(100%,calc(100dvh-24rem))]">
      {/* Boat-centred window, no current arrow: the Captain needs Sonar for what's beyond the
          lookout and Weather for the drift (playtest fix 1). */}
      <OceanCanvas gameId={view.gameId} boat={view.boat} hazards={view.visibleHazards} markers={view.markers}
        stormIntensity={view.stormIntensity} window={CAPTAIN_WINDOW} className="instrument" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between rounded-b-2xl bg-gradient-to-t from-abyss/90 to-transparent px-3 pb-3 pt-8 font-mono text-[9px] uppercase tracking-widest">
        <span className="text-teal">{view.shieldActive ? "Braced" : "Driver · sun glare"}</span>
        <span className="text-mist">Ski {Math.round(view.boat.hull)}%</span>
      </div>
    </div>
    <CaptainControls key={view.gameId} boat={view.boat} onAction={onAction} disabled={view.mission.phase !== "active"} />
  </div>;
}

