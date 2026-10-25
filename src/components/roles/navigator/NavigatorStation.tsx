"use client";
/**
 * Navigator's phone screen (2v2). OWNER: Developer 4.
 * Props in (VersusNavigatorView), typed actions out (onAction): SONAR_PING, MARK_HAZARD,
 * RADIO_SCAN, MARK_TARGET. No game rules here.
 *
 * BASELINE PLACEHOLDER (handoff versus-1): just the existing Sonar and Radio stations stacked,
 * so a match is playable end to end today. TODO(dev4): replace with the real Navigator screen.
 */
import type { PlayerAction } from "@/game/types";
import type { VersusNavigatorView } from "@/game/versus/contract";
import { RadioStation } from "../radio/RadioStation";
import { SonarStation } from "../sonar/SonarStation";

export interface NavigatorStationProps {
  view: VersusNavigatorView;
  onAction: (action: PlayerAction) => void;
}

export function NavigatorStation({ view, onAction }: NavigatorStationProps) {
  return (
    <div className="grid gap-4">
      <SonarStation view={view.sonar} onAction={onAction} />
      <RadioStation view={view.radio} onAction={onAction} />
    </div>
  );
}
