"use client";
/**
 * Radio operator's phone screen: "Signal Hunt".
 * One decision every scan: confirm the hot square, scan next door to see which way the Gull is
 * drifting, or move the shared pin. Radio is the only one who knows if the pin is still right.
 * Props in (RadioView), typed actions out (onAction). Readings fade with MISSION time, so every
 * phone agrees and no new data is needed.
 */
import { useState } from "react";
import type { PlayerAction, RadioView, SectorId, SignalReading } from "@/game/types";
import { RADIO } from "@/game/config";
import { ALL_SECTORS, sectorCenter, sectorOf } from "@/game/sectors";
import { SignalBars, StationPanel } from "../instruments";

export interface RadioStationProps {
  view: RadioView;
  onAction: (action: PlayerAction) => void;
}

/** A reading greys out over this long: the Gull drifts, so old fixes go stale. */
const FADE_MS = 10_000;

/** Cold blue → hot orange by strength, washed toward grey as the reading ages. */
function tileColor(strength: number, freshness: number): string {
  const cold = [31, 122, 153];
  const hot = [245, 120, 36];
  const grey = [40, 52, 72];
  const mix = cold.map((c, i) => c + ((hot[i] ?? c) - c) * strength);
  const rgb = mix.map((c, i) => Math.round((grey[i] ?? c) + (c - (grey[i] ?? c)) * freshness));
  return `rgb(${rgb.join(" ")} / ${0.35 + 0.5 * freshness})`;
}

export function RadioStation({ view, onAction }: RadioStationProps) {
  const [mode, setMode] = useState<"scan" | "pin">("scan");
  const [lastTapped, setLastTapped] = useState<SectorId | null>(null);
  const now = view.mission.elapsedMs;
  const active = view.mission.phase === "active";
  const remaining = Math.max(0, view.scanReadyAtMs - now);
  const cooling = remaining > 0;

  const latest = new Map<SectorId, SignalReading>();
  for (const r of view.readings) latest.set(r.sector, r);
  // Clamped both ways: a reading stamped "in the future" (mock data, clock skew) is just fresh.
  const freshness = (r: SignalReading) => Math.min(1, Math.max(0, 1 - (now - r.atMs) / FADE_MS));
  const hottest = [...latest.values()]
    .filter((r) => freshness(r) > 0)
    .reduce<SignalReading | null>((best, r) => (best === null || r.strength > best.strength ? r : best), null);

  // The shared "we think they're here" marker, plus a ghost of where it was before.
  const pin = view.markers.find((m) => m.kind === "target_guess");
  const pinSector = pin ? sectorOf(pin.position) : null;
  // Derived state, updated during render when the pin moves (React's "previous value" pattern).
  const [pinTrack, setPinTrack] = useState<{ current: SectorId | null; previous: SectorId | null }>({
    current: pinSector,
    previous: null,
  });
  if (pinSector !== pinTrack.current) setPinTrack({ current: pinSector, previous: pinTrack.current });
  const ghostSector = pinTrack.previous;

  const lastFixMs = view.lastScanAtMs === null ? null : Math.max(0, now - view.lastScanAtMs);

  const tap = (sector: SectorId) => {
    if (mode === "pin") {
      onAction({ type: "MARK_TARGET", position: sectorCenter(sector) });
      setMode("scan");
      return;
    }
    setLastTapped(sector);
    onAction({ type: "RADIO_SCAN", sector });
  };

  return (
    <div className="grid gap-3">
      <StationPanel title="Sightings" tone="amber">
        <p className="font-display text-2xl font-bold uppercase tracking-wide">
          {lastFixMs === null ? "No fix yet" : `Last fix ${Math.floor(lastFixMs / 1000)} s ago`}
        </p>
        <p className="mb-3 font-mono text-xs text-mist">
          {mode === "pin" ? "Tap a square to move the pin." : cooling ? `Scanning… ${(remaining / 1000).toFixed(1)} s` : "Tap a square to scan."}
        </p>

        <div className="grid grid-cols-4 gap-1.5">
          {ALL_SECTORS.map((s) => {
            const reading = latest.get(s);
            const fresh = reading ? freshness(reading) : 0;
            const isHot = hottest !== null && reading === hottest;
            const scanning = cooling && s === lastTapped;
            // Pin mode never waits on the scan cooldown.
            const blocked = !active || (mode === "scan" && cooling);
            return (
              <button
                key={s}
                type="button"
                disabled={blocked}
                onClick={() => tap(s)}
                aria-label={`${s}${reading ? `, signal ${Math.round(reading.strength * 3)} of 3` : ""}${s === pinSector ? ", pinned" : ""}`}
                className={`relative flex aspect-square min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border font-mono text-xs transition active:scale-95 ${
                  mode === "pin" ? "border-brass" : "border-hull"
                } ${blocked && !scanning ? "opacity-50" : ""} ${isHot ? "animate-pulse" : ""} bg-navy`}
                style={reading ? { backgroundColor: tileColor(reading.strength, fresh) } : undefined}
              >
                <span className="text-mist">{s}</span>
                {reading && <SignalBars strength={reading.strength} bars={3} />}
                {s === pinSector && <PinIcon className="absolute right-1 top-1 text-brass" />}
                {s === ghostSector && s !== pinSector && <PinIcon className="absolute right-1 top-1 text-brass opacity-30" />}
                {scanning && <CooldownRing fraction={1 - remaining / RADIO.scanCooldownMs} />}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Tap mode" className="mt-3 grid h-14 grid-cols-2 overflow-hidden rounded-xl border border-hull font-display text-lg font-semibold uppercase tracking-[0.2em]">
          {(["scan", "pin"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} disabled={!active}
              className={mode === m ? "bg-amber text-abyss" : "bg-navy text-mist"}>
              {m}
            </button>
          ))}
        </div>
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

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className={className}>
      <path d="M8 1a4.5 4.5 0 0 0-4.5 4.5C3.5 9 8 15 8 15s4.5-6 4.5-9.5A4.5 4.5 0 0 0 8 1Z" fill="currentColor" />
    </svg>
  );
}

function CooldownRing({ fraction }: { fraction: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" aria-hidden className="pointer-events-none absolute inset-0 m-auto h-11 w-11">
      <circle cx={22} cy={22} r={r} fill="none" stroke="var(--color-amber)" strokeWidth={3}
        strokeDasharray={`${c * Math.max(0, Math.min(1, fraction))} ${c}`} transform="rotate(-90 22 22)" />
    </svg>
  );
}
