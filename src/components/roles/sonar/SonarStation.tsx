"use client";
/**
 * Sonar operator's phone screen. OWNER: Developer 4.
 * Props in (SonarView), typed actions out (onAction). No game rules here: the engine decides
 * what a ping reveals; this screen only draws `view.contacts` and emits SONAR_PING / MARK_HAZARD.
 */
import type { PlayerAction, SonarView, Vec2 } from "@/game/types";
import { SONAR } from "@/game/config";
import { CooldownButton, Readout, ReadoutRow, StationPanel } from "../instruments";
import { SonarScope } from "./SonarScope";

export interface SonarStationProps {
  view: SonarView;
  onAction: (action: PlayerAction) => void;
}

export function SonarStation({ view, onAction }: SonarStationProps) {
  const now = view.mission.elapsedMs;
  const active = view.mission.phase === "active";
  const pingReady = now >= view.pingReadyAtMs;
  const hull = Math.round(view.boat.hull);

  const mark = (position: Vec2) => {
    if (!active) return;
    onAction({ type: "MARK_HAZARD", position });
  };

  return (
    <div className="grid gap-3">
      <StationPanel title="Drone camera · tap to mark" tone="cyan">
        <SonarScope view={view} onMark={mark} disabled={!active} />
        <ReadoutRow>
          <Readout label="Spotted" value={view.contacts.length} tone="amber" />
          <Readout label="Ski" value={hull} unit="%" tone={hull <= 25 ? "hazard" : "teal"} />
          <Readout label="Sweep" value={pingReady ? "Ready" : "Wait"} tone={pingReady ? "cyan" : "mist"} />
        </ReadoutRow>
      </StationPanel>
      <CooldownButton
        label="Sweep"
        nowMs={now}
        readyAtMs={view.pingReadyAtMs}
        cooldownMs={SONAR.pingCooldownMs}
        disabled={!active}
        onPress={() => onAction({ type: "SONAR_PING" })}
      />
    </div>
  );
}
