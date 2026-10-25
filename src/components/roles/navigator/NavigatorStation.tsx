"use client";
/**
 * Navigator's phone screen (2v2 Rescue Showdown). OWNER: Developer 4.
 * Props in (VersusNavigatorView + versus-3 rival / scoreboard), typed actions out.
 * No game rules — the engine decides what a sweep or scan reveals.
 *
 * Layout: callout → hull → tabs → one main panel → Sweep / Scan / Mark bar.
 * Designed for 375×812 with no in-station scroll during play.
 */
import { useEffect, useRef, useState } from "react";
import type { PlayerAction, SectorId, Vec2 } from "@/game/types";
import { RADIO, SONAR } from "@/game/config";
import { sectorOf } from "@/game/sectors";
import type { MatchScoreboard, TeamId, VersusNavigatorView } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { CooldownButton } from "../instruments";
import { SonarScope } from "../sonar/SonarScope";
import { RadioGrid } from "../radio/RadioGrid";
import { hypot2, navigatorCallout } from "./callouts";
import { nearestContactAhead } from "./mark-ahead";
import { hazardMarkCount, markIntent, MAX_HAZARD_MARKS } from "./markers";
import { NavigatorTabs, type NavigatorTab } from "./NavigatorTabs";
import { SkiHullBar } from "./SkiHullBar";

/** versus-3: `rival` is always on the view once the contract merges; optional until then. */
export type NavigatorViewInput = VersusNavigatorView & { rival?: Vec2 };

export interface NavigatorStationProps {
  view: NavigatorViewInput;
  /** Public match scoreboard — Dev 2 wires this from VersusRoleStation. */
  scoreboard?: MatchScoreboard;
  onAction: (action: PlayerAction) => void;
}

/** Sudden teleport distance that looks like a wreck / aground reset (not normal driving). */
const JUMP_DIST = 0.22;
/** Bottom of the map = dock berths (blue slightly left, red slightly right of centre). */
const DOCK_Y = 0.78;

function rivalTeamId(team: TeamId): TeamId {
  return team === "blue" ? "red" : "blue";
}

export function NavigatorStation({ view, scoreboard, onAction }: NavigatorStationProps) {
  const [tab, setTab] = useState<NavigatorTab>("drone");
  const [markToast, setMarkToast] = useState<{ text: string; warn: boolean } | null>(null);
  const [dockToast, setDockToast] = useState(false);
  const [rivalFlash, setRivalFlash] = useState<string | null>(null);
  const [flashSector, setFlashSector] = useState<SectorId | null>(null);
  const [hasSwept, setHasSwept] = useState(() => view.sonar.contacts.length > 0);
  const [hasMarked, setHasMarked] = useState(() => hazardMarkCount(view.sonar.markers) > 0);
  const [suppressPerson, setSuppressPerson] = useState(false);
  const prevPos = useRef(view.sonar.boat.position);
  const prevRivalRescues = useRef<number | null>(null);

  const now = view.sonar.mission.elapsedMs;
  const active = view.sonar.mission.phase === "active";
  const team = TEAM_INFO[view.team];
  const rivalId = rivalTeamId(view.team);
  const rivalInfo = TEAM_INFO[rivalId];
  const rival = view.rival ?? null;

  const baseCallout = navigatorCallout(view.sonar, view.radio, now);
  const callout =
    rivalFlash !== null
      ? { kind: "prompt" as const, text: rivalFlash }
      : suppressPerson && baseCallout.kind === "survivor"
        ? { kind: "prompt" as const, text: "SWEEP TO SCAN FOR OBSTACLES" }
        : baseCallout;
  const personFound = callout.kind === "survivor";
  const boatSector = sectorOf(view.radio.boat.position);
  const hull = view.sonar.boat.hull;
  const marks = hazardMarkCount(view.sonar.markers);
  const coachPulse = hasSwept && !hasMarked;
  const ahead = nearestContactAhead(view.sonar);

  useEffect(() => {
    if (!markToast) return;
    const id = window.setTimeout(() => setMarkToast(null), markToast.warn ? 2600 : 1200);
    return () => window.clearTimeout(id);
  }, [markToast]);

  useEffect(() => {
    if (!dockToast) return;
    const id = window.setTimeout(() => setDockToast(false), 1600);
    return () => window.clearTimeout(id);
  }, [dockToast]);

  useEffect(() => {
    if (!rivalFlash) return;
    const id = window.setTimeout(() => {
      setRivalFlash(null);
      setSuppressPerson(false);
    }, 2800);
    return () => window.clearTimeout(id);
  }, [rivalFlash]);

  // Detect aground / wreck respawn: big jump toward the dock (bottom of the map).
  useEffect(() => {
    const pos = view.sonar.boat.position;
    const prev = prevPos.current;
    const jumped = hypot2(prev, pos) > JUMP_DIST;
    const atDock = pos.y >= DOCK_Y;
    if (jumped && atDock && active) setDockToast(true);
    prevPos.current = pos;
  }, [view.sonar.boat.position, active]);

  // Rival scored → flash + suppress person callout until the next sweep finds them again.
  useEffect(() => {
    if (!scoreboard) return;
    const rescues = scoreboard.scores[rivalId]?.rescues ?? 0;
    if (prevRivalRescues.current !== null && rescues > prevRivalRescues.current) {
      setRivalFlash(`${rivalInfo.label.toUpperCase()} GOT THEM — new person in the water`);
      setSuppressPerson(true);
    }
    prevRivalRescues.current = rescues;
  }, [scoreboard, rivalId, rivalInfo.label]);

  // Two hazard marks per crew (VERSUS.maxHazardMarks, enforced by the engine). Tapping a mark
  // removes it; at the cap a new mark isn't sent, the toast says how to free a slot instead.
  const FULL_TEXT = `${MAX_HAZARD_MARKS} / ${MAX_HAZARD_MARKS} marks · tap a mark to remove it first`;
  const mark = (position: Vec2) => {
    if (!active) return;
    const intent = markIntent(view.sonar.markers, position);
    if (intent === "full") {
      setMarkToast({ text: FULL_TEXT, warn: true });
      return;
    }
    onAction({ type: "MARK_HAZARD", position });
    setMarkToast(intent === "remove" ? { text: "Mark removed", warn: false } : { text: "Marked · your Driver sees it", warn: false });
    if (intent === "place") setHasMarked(true);
  };

  const markAhead = () => {
    if (!ahead || !active) return;
    // The button only ever places: if the contact ahead already carries a mark, leave it.
    if (markIntent(view.sonar.markers, ahead) === "remove") {
      setMarkToast({ text: "Already marked", warn: false });
      return;
    }
    mark(ahead);
  };

  const hazardMarks = view.sonar.markers.filter((m) => m.kind === "hazard");

  const sweep = () => {
    onAction({ type: "SONAR_PING" });
    setHasSwept(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(30);
    }
  };

  const scanBoatSector = () => {
    setFlashSector(boatSector);
    onAction({ type: "RADIO_SCAN", sector: boatSector });
  };

  const calloutTone =
    rivalFlash !== null
      ? rivalInfo.text
      : callout.kind === "survivor"
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
          personFound || rivalFlash ? "navigator-callout--found" : ""
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
            <h3 className="mb-1 flex items-center justify-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan">
              Drone · land &amp; jellies
            </h3>
            <div className="mx-auto w-full max-w-[min(100%,32dvh)]">
              <SonarScope
                view={view.sonar}
                onMark={mark}
                disabled={!active}
                rival={rival}
                rivalColor={rivalInfo.hex}
                coachPulse={coachPulse}
              />
            </div>
            <p className="mt-1.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan">
              Tap the radar to mark an obstacle · tap a mark to remove it
            </p>
            {coachPulse && (
              <p className="mt-1 animate-pulse text-center font-display text-sm font-bold uppercase tracking-wide text-amber">
                Tap a contact to mark it
              </p>
            )}
            <div className="mt-1 flex items-center justify-center gap-2">
              <span
                className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${marks >= MAX_HAZARD_MARKS ? "text-amber" : "text-mist"}`}
              >
                Hazard markers: {marks} / {MAX_HAZARD_MARKS}
              </span>
              {hazardMarks.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!active}
                  onClick={() => mark(m.position)}
                  aria-label={`Remove hazard mark ${i + 1}`}
                  className="h-11 min-w-11 rounded-lg border border-hazard/60 bg-abyss/80 px-2 font-mono text-xs font-bold uppercase text-hazard disabled:opacity-40"
                >
                  ✕ {i + 1}
                </button>
              ))}
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
            <RadioGrid
              view={view.radio}
              onAction={onAction}
              flashSector={flashSector}
              compact
            />
          </section>
        )}

        {markToast && (
          <p
            role="status"
            className={`pointer-events-none absolute inset-x-2 top-2 rounded-lg border bg-abyss/90 px-3 py-2 text-center font-mono text-sm font-semibold uppercase tracking-wide shadow-lg ${
              markToast.warn ? "border-amber/60 text-amber" : "border-teal/40 text-teal"
            }`}
          >
            {markToast.text}
          </p>
        )}
        {dockToast && (
          <p
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-lg border border-hazard/50 bg-abyss/95 px-3 py-2 text-center font-display text-base font-bold uppercase tracking-wide text-hazard shadow-lg"
          >
            Back at the dock
          </p>
        )}
      </div>

      {/* Each tab shows only its own tools (playtest r4): Sweep + Mark belong to the drone radar,
          Scan to the radio; the radio's Scan/Pin toggle lives in the grid itself. */}
      {tab === "drone" ? (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <CooldownButton
            label="Sweep"
            tone="cyan"
            size="md"
            nowMs={now}
            readyAtMs={view.sonar.pingReadyAtMs}
            cooldownMs={SONAR.pingCooldownMs}
            disabled={!active}
            urgent={callout.kind === "prompt" && !rivalFlash}
            onPress={sweep}
          />
          <button
            type="button"
            disabled={!active || !ahead}
            onClick={markAhead}
            aria-label="Mark nearest obstacle ahead"
            className="relative h-16 min-h-11 w-full overflow-hidden rounded-xl border-2 border-teal bg-navy font-display text-sm font-semibold uppercase tracking-[0.12em] text-teal transition active:scale-[0.98] disabled:opacity-40"
          >
            Mark
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 pt-1">
          <CooldownButton
            label="Scan"
            tone="amber"
            size="md"
            nowMs={now}
            readyAtMs={view.radio.scanReadyAtMs}
            cooldownMs={RADIO.scanCooldownMs}
            disabled={!active}
            urgent={callout.kind === "prompt" && !rivalFlash}
            onPress={scanBoatSector}
          />
        </div>
      )}
    </div>
  );
}
