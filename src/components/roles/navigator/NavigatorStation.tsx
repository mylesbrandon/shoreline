"use client";
/**
 * Navigator's phone screen (2v2 Rescue Showdown). OWNER: Developer 4.
 * Props in (VersusNavigatorView), typed actions out: SONAR_PING, MARK_HAZARD, RADIO_SCAN, MARK_TARGET.
 * No game rules — the engine decides what a sweep or scan reveals.
 *
 * Layout: callout → hull → tabs → one main panel → persistent SWEEP + SCAN bar.
 * Designed for 375×812 with no in-station scroll during play.
 */
import { useEffect, useRef, useState } from "react";
import type { PlayerAction, SectorId, Vec2 } from "@/game/types";
import { MISSION, RADIO, SONAR } from "@/game/config";
import { sectorOf } from "@/game/sectors";
import type { VersusNavigatorView } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { CooldownButton } from "../instruments";
import { SonarScope } from "../sonar/SonarScope";
import { RadioGrid } from "../radio/RadioGrid";
import { hypot2, navigatorCallout } from "./callouts";
import { NavigatorTabs, type NavigatorTab } from "./NavigatorTabs";
import { SkiHullBar } from "./SkiHullBar";

export interface NavigatorStationProps {
  view: VersusNavigatorView;
  onAction: (action: PlayerAction) => void;
}

/** Near enough to MISSION.boatStart to count as "back at the tower". */
const TOWER_RADIUS = 0.07;
/** Sudden teleport distance that looks like a wreck / aground reset (not normal driving). */
const JUMP_DIST = 0.22;

export function NavigatorStation({ view, onAction }: NavigatorStationProps) {
  const [tab, setTab] = useState<NavigatorTab>("drone");
  const [markToast, setMarkToast] = useState(false);
  const [towerToast, setTowerToast] = useState(false);
  const [flashSector, setFlashSector] = useState<SectorId | null>(null);
  const prevPos = useRef(view.sonar.boat.position);

  const now = view.sonar.mission.elapsedMs;
  // Versus UIs ignore co-op victory/failure; only "active" enables inputs (CONTRACTS.md).
  const active = view.sonar.mission.phase === "active";
  const team = TEAM_INFO[view.team];
  const callout = navigatorCallout(view.sonar, view.radio, now);
  const personFound = callout.kind === "survivor";
  const boatSector = sectorOf(view.radio.boat.position);
  const hull = view.sonar.boat.hull;

  useEffect(() => {
    if (!markToast) return;
    const id = window.setTimeout(() => setMarkToast(false), 1000);
    return () => window.clearTimeout(id);
  }, [markToast]);

  useEffect(() => {
    if (!towerToast) return;
    const id = window.setTimeout(() => setTowerToast(false), 1600);
    return () => window.clearTimeout(id);
  }, [towerToast]);

  // Detect aground / wreck respawn: boat jumps near the tower start.
  useEffect(() => {
    const pos = view.sonar.boat.position;
    const prev = prevPos.current;
    const jumped = hypot2(prev, pos) > JUMP_DIST;
    const atTower = hypot2(pos, MISSION.boatStart) < TOWER_RADIUS;
    if (jumped && atTower && active) setTowerToast(true);
    prevPos.current = pos;
  }, [view.sonar.boat.position, active]);

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
          personFound ? "navigator-callout--found" : ""
        }`}
      >
        {callout.text}
      </p>

      <SkiHullBar hull={hull} />

      <NavigatorTabs tab={tab} onChange={setTab} />

      <div className="relative min-h-0 flex-1">
        {tab === "drone" ? (
          <section
            className="rounded-2xl border-2 border-cyan/50 bg-gradient-to-b from-cyan/10 to-abyss/80 p-2"
            aria-label="Drone radar"
          >
            <h3 className="mb-1.5 flex items-center justify-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan">
              Drone · land &amp; jellies
            </h3>
            <div className="mx-auto w-full max-w-[min(100%,34dvh)]">
              <SonarScope view={view.sonar} onMark={mark} disabled={!active} />
            </div>
          </section>
        ) : (
          <section
            className="rounded-2xl border-2 border-amber/50 p-2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 3px, rgb(255 200 61 / 0.04) 3px, rgb(255 200 61 / 0.04) 4px), linear-gradient(180deg, rgb(255 200 61 / 0.12), rgb(8 48 74 / 0.9))",
            }}
            aria-label="Beach radio"
          >
            <h3 className="mb-1.5 flex items-center justify-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-amber">
              Radio · calls from the beach
            </h3>
            <RadioGrid view={view.radio} onAction={onAction} flashSector={flashSector} compact />
          </section>
        )}

        {markToast && (
          <p
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-lg border border-teal/40 bg-abyss/90 px-3 py-2 text-center font-mono text-sm text-teal shadow-lg"
          >
            Marked for your Driver
          </p>
        )}
        {towerToast && (
          <p
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-lg border border-hazard/50 bg-abyss/95 px-3 py-2 text-center font-display text-base font-bold uppercase tracking-wide text-hazard shadow-lg"
          >
            Back at the tower
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
