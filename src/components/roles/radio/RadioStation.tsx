"use client";
/**
 * Radio operator's phone screen: "Signal Hunt".
 * One decision every scan: confirm the hot square, scan next door to track the person in the water,
 * or move the shared pin. Radio is the only one who knows if the pin is still right.
 * Props in (RadioView), typed actions out (onAction). Readings fade with MISSION time, so every
 * phone agrees and no new data is needed.
 */
import type { PlayerAction, RadioView } from "@/game/types";
import { StationPanel } from "../instruments";
import { RadioGrid } from "./RadioGrid";

export interface RadioStationProps {
  view: RadioView;
  onAction: (action: PlayerAction) => void;
}

export function RadioStation({ view, onAction }: RadioStationProps) {
  const now = view.mission.elapsedMs;
  const lastFixMs = view.lastScanAtMs === null ? null : Math.max(0, now - view.lastScanAtMs);

  return (
    <div className="grid gap-3">
      <StationPanel title="Sightings" tone="amber">
        <p className="mb-3 font-display text-2xl font-bold uppercase tracking-wide">
          {lastFixMs === null ? "No fix yet" : `Last fix ${Math.floor(lastFixMs / 1000)} s ago`}
        </p>
        <RadioGrid view={view} onAction={onAction} />
      </StationPanel>

      <StationPanel title="Beach radio" tone="amber">
        <ul className="grid gap-1 font-mono text-sm text-amber">
          {view.distressLog.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </StationPanel>
    </div>
  );
}
