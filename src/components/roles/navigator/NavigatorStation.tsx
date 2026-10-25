"use client";
/**
 * Navigator's phone screen (2v2 Rescue Showdown). OWNER: Developer 4.
 * Props in (VersusNavigatorView), typed actions out: SONAR_PING, MARK_HAZARD, RADIO_SCAN, MARK_TARGET.
 * No game rules — the engine decides what a sweep or scan reveals.
 *
 * Layout: callout → DRONE|RADIO tabs → one main panel → persistent SWEEP + SCAN bar.
 * Designed for 375×812 with no in-station scroll during play.
 */
import { useEffect, useState } from "react";
import type { PlayerAction, SectorId, Vec2 } from "@/game/types";
import { RADIO, SONAR } from "@/game/config";
import { sectorOf } from "@/game/sectors";
import type { VersusNavigatorView } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { CooldownButton } from "../instruments";
import { SonarScope } from "../sonar/SonarScope";
import { RadioGrid } from "../radio/RadioGrid";
import { navigatorCallout } from "./callouts";
import { NavigatorTabs, type NavigatorTab } from "./NavigatorTabs";

export interface NavigatorStationProps {
  view: VersusNavigatorView;
  onAction: (action: PlayerAction) => void;
}

export function NavigatorStation({ view, onAction }: NavigatorStationProps) {
  const [tab, setTab] = useState<NavigatorTab>("drone");
  const [markToast, setMarkToast] = useState(false);
  const [flashSector, setFlashSector] = useState<SectorId | null>(null);

  const now = view.sonar.mission.elapsedMs;
  // Versus UIs ignore co-op victory/failure; only "active" enables inputs (CONTRACTS.md).
  const active = view.sonar.mission.phase === "active";
  const team = TEAM_INFO[view.team];
  const callout = navigatorCallout(view.sonar, view.radio, now);
  const survivorFound = callout.kind === "survivor";
  const boatSector = sectorOf(view.radio.boat.position);

  useEffect(() => {
    if (!markToast) return;
    const id = window.setTimeout(() => setMarkToast(false), 1000);
    return () => window.clearTimeout(id);
  }, [markToast]);

  const mark = (position: Vec2) => {
    if (!active) return;
    onAction({ type: "MARK_HAZARD", position });
    setMarkToast(true);
  };

  const sweep = () => {
    onAction({ type: "SONAR_PING" });
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(30);
    }
  };

  const scanBoatSector = () => {
    setFlashSector(boatSector);
    onAction({ type: "RADIO_SCAN", sector: boatSector });
  };

  const calloutTone =
    callout.kind === "survivor"
      ? "text-amber"
      : callout.kind === "hazard"
        ? "text-hazard"
        : callout.kind === "signal"
          ? team.text
          : "text-mist";

  return (
    <div className="navigator-station flex flex-col gap-2">
      <p
        role="status"
        aria-live="polite"
        className={`navigator-callout text-center font-display font-bold uppercase leading-tight tracking-wide ${calloutTone} ${
          survivorFound ? "navigator-callout--found" : ""
        }`}
      >
        {callout.text}
      </p>

      <NavigatorTabs tab={tab} onChange={setTab} accentClass={`${team.text} ${team.border}`} />

      <div className="relative min-h-0 flex-1">
        {tab === "drone" ? (
          <div className="mx-auto w-full max-w-[min(100%,38dvh)]">
            <SonarScope view={view.sonar} onMark={mark} disabled={!active} />
          </div>
        ) : (
          <RadioGrid view={view.radio} onAction={onAction} flashSector={flashSector} compact />
        )}

        {markToast && (
          <p
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-lg border border-teal/40 bg-abyss/90 px-3 py-2 text-center font-mono text-sm text-teal shadow-lg"
          >
            Marked for your Driver
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <CooldownButton
          label="Sweep"
          tone="cyan"
          size="md"
          nowMs={now}
          readyAtMs={view.sonar.pingReadyAtMs}
          cooldownMs={SONAR.pingCooldownMs}
          disabled={!active}
          urgent={callout.kind === "prompt"}
          onPress={sweep}
        />
        <CooldownButton
          label="Scan"
          tone="amber"
          size="md"
          nowMs={now}
          readyAtMs={view.radio.scanReadyAtMs}
          cooldownMs={RADIO.scanCooldownMs}
          disabled={!active}
          urgent={callout.kind === "prompt"}
          onPress={scanBoatSector}
        />
      </div>
    </div>
  );
}
