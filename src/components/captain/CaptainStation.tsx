"use client";
/**
 * Captain's phone screen. OWNER: Developer 3.
 * Props in (CaptainView), typed actions out (onAction). That's the whole contract.
 */
import type { CaptainView, PlayerAction } from "@/game/types";
import { OceanCanvas } from "@/components/ocean/OceanCanvas";
import { CaptainControls } from "./CaptainControls";

export interface CaptainStationProps {
  view: CaptainView;
  onAction: (action: PlayerAction) => void;
}

export function CaptainStation({ view, onAction }: CaptainStationProps) {
  return (
    <div className="grid gap-3">
      <OceanCanvas
        boat={view.boat}
        hazards={view.visibleHazards}
        markers={view.markers}
        current={view.current}
        stormIntensity={view.stormIntensity}
        className="instrument"
      />
      <CaptainControls boat={view.boat} onAction={onAction} disabled={view.mission.phase !== "active"} />
    </div>
  );
}
