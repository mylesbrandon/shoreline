"use client";
/**
 * 4×4 sector grid with scan / pin modes. OWNER: Developer 4.
 * Shared by co-op RadioStation and the versus Navigator RADIO tab.
 */
import { useState } from "react";
import type { PlayerAction, RadioView, SectorId, SignalReading } from "@/game/types";
import { RADIO } from "@/game/config";
import { ALL_SECTORS, sectorCenter, sectorOf } from "@/game/sectors";
import { SignalBars } from "../instruments";

export interface RadioGridProps {
  view: RadioView;
  onAction: (action: PlayerAction) => void;
  /** When the parent fires a boat-sector SCAN, show that tile's cooldown ring. */
  flashSector?: SectorId | null;
  /** Smaller tiles for the Navigator's tight layout. */
  compact?: boolean;
  /** versus-3: rival boat on the sector map (optional until the view always carries it). */
  rival?: { x: number; y: number } | null;
  rivalColor?: string;
}

/** A reading greys out over this long: the person drifts, so old fixes go stale. */
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

export function RadioGrid({
  view,
  onAction,
  flashSector = null,
  compact = false,
  rival = null,
  rivalColor = "#ff5a4e",
}: RadioGridProps) {
  const [mode, setMode] = useState<"scan" | "pin">("scan");
  const [lastTapped, setLastTapped] = useState<SectorId | null>(null);
  const now = view.mission.elapsedMs;
  const active = view.mission.phase === "active";
  const remaining = Math.max(0, view.scanReadyAtMs - now);
  const cooling = remaining > 0;
  const latest = new Map<SectorId, SignalReading>();
  for (const r of view.readings) latest.set(r.sector, r);
  const freshness = (r: SignalReading) => Math.min(1, Math.max(0, 1 - (now - r.atMs) / FADE_MS));
  const hottest = [...latest.values()]
    .filter((r) => freshness(r) > 0)
    .reduce<SignalReading | null>((best, r) => (best === null || r.strength > best.strength ? r : best), null);

  const pin = view.markers.find((m) => m.kind === "target_guess");
  const pinSector = pin ? sectorOf(pin.position) : null;
  const [pinTrack, setPinTrack] = useState<{ current: SectorId | null; previous: SectorId | null }>({
    current: pinSector,
    previous: null,
  });
  if (pinSector !== pinTrack.current) setPinTrack({ current: pinSector, previous: pinTrack.current });
  const ghostSector = pinTrack.previous;

  const tap = (sector: SectorId) => {
    if (mode === "pin") {
      onAction({ type: "MARK_TARGET", position: sectorCenter(sector) });
      setMode("scan");
      return;
    }
    setLastTapped(sector);
    onAction({ type: "RADIO_SCAN", sector });
  };

  const tileMin = compact ? "min-h-11" : "min-h-[72px]";

  const hint =
    mode === "pin" ? "Tap a square to move the pin." : cooling ? `Scanning… ${(remaining / 1000).toFixed(1)} s` : "Tap a square to scan.";

  return (
    <div className="grid gap-2">
      {!compact && <p className="font-mono text-xs text-mist">{hint}</p>}
      {compact && (
        <p className="text-sm text-mist">
          {mode === "pin" ? "Tap a square to move your pin." : cooling ? `Scanning, ready in ${(remaining / 1000).toFixed(1)} s` : "Tap a square to scan it, or press Scan."}
        </p>
      )}
      <div className={`relative grid grid-cols-4 ${compact ? "gap-1" : "gap-1.5"}`}>
        {ALL_SECTORS.map((s) => {
          const reading = latest.get(s);
          const fresh = reading ? freshness(reading) : 0;
          const isHot = hottest !== null && reading === hottest;
            const scanning = cooling && (s === lastTapped || s === flashSector);
          const blocked = !active || (mode === "scan" && cooling);
          return (
            <button
              key={s}
              type="button"
              disabled={blocked}
              onClick={() => tap(s)}
              aria-label={`${s}${reading ? `, signal ${Math.round(reading.strength * 3)} of 3` : ""}${s === pinSector ? ", pinned" : ""}`}
              className={`relative flex aspect-square ${tileMin} flex-col items-center justify-center gap-0.5 rounded-xl border text-sm font-semibold transition active:scale-95 ${
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
        {rival && (
          <div
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${rival.x * 100}%`, top: `${rival.y * 100}%` }}
            aria-hidden
          >
            <span
              className="block size-0 border-x-[6px] border-b-[10px] border-x-transparent"
              style={{ borderBottomColor: rivalColor }}
            />
            <span className="mt-0.5 text-[11px] font-bold" style={{ color: rivalColor }}>
              Rival
            </span>
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label="Tap mode"
        className={`grid grid-cols-2 overflow-hidden rounded-xl border border-hull font-display font-bold ${
          compact ? "h-12 text-base" : "h-14 text-lg"
        }`}
      >
        {(["scan", "pin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            disabled={!active}
            className={mode === m ? "bg-amber text-abyss" : "bg-navy text-mist"}
          >
            {m === "scan" ? "Scan" : "Pin"}
          </button>
        ))}
      </div>
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
      <circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke="var(--color-amber)"
        strokeWidth={3}
        strokeDasharray={`${c * Math.max(0, Math.min(1, fraction))} ${c}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}
