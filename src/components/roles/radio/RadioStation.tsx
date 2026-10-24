"use client";
/**
 * Radio operator's phone screen — PLACEHOLDER. OWNER: Developer 4.
 * Props in (RadioView), typed actions out (onAction). Uses the shared instrument kit so it
 * already sits in the same family as sonar / weather.
 *
 * TODO(dev4, later):
 *  - Heat-map the sector grid by reading strength; highlight the strongest.
 *  - Long-press a sector to send MARK_TARGET at its center (sectorCenter from @/game/sectors).
 *  - Typewriter effect for distressLog lines; static/noise audio on scan.
 *  - Dedicated scan cooldown ring (scanReadyAtMs is already wired to disable the grid).
 */
import type { PlayerAction, RadioView, SectorId } from "@/game/types";
import { ALL_SECTORS } from "@/game/sectors";
import { Readout, ReadoutRow, SignalBars, StationPanel } from "../instruments";

export interface RadioStationProps {
  view: RadioView;
  onAction: (action: PlayerAction) => void;
}

export function RadioStation({ view, onAction }: RadioStationProps) {
  const latest = new Map<SectorId, number>();
  for (const r of view.readings) latest.set(r.sector, r.strength);
  const active = view.mission.phase === "active";
  const remaining = Math.max(0, view.scanReadyAtMs - view.mission.elapsedMs);
  const cooling = remaining > 0;
  const peak = view.readings.reduce((best, r) => (r.strength > best ? r.strength : best), 0);

  return (
    <div className="grid gap-3">
      <StationPanel title="Sector scan · tap a sector" tone="amber">
        <ReadoutRow>
          <Readout label="Readings" value={view.readings.length} tone="amber" />
          <Readout label="Peak" value={Math.round(peak * 100)} unit="%" tone="amber" />
          <Readout
            label="Scan"
            value={cooling ? `${(remaining / 1000).toFixed(1)}s` : "Ready"}
            tone={cooling ? "mist" : "teal"}
          />
        </ReadoutRow>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {ALL_SECTORS.map((s) => {
            const strength = latest.get(s);
            return (
              <button
                key={s}
                type="button"
                disabled={!active || cooling}
                onClick={() => onAction({ type: "RADIO_SCAN", sector: s })}
                className="flex aspect-square min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-hull bg-navy font-mono text-xs text-mist transition active:scale-95 disabled:opacity-60"
                style={strength !== undefined ? { backgroundColor: `rgb(245 165 36 / ${0.08 + strength * 0.45})` } : undefined}
              >
                <span>{s}</span>
                {strength !== undefined && <SignalBars strength={strength} bars={4} />}
              </button>
            );
          })}
        </div>
      </StationPanel>
      <StationPanel title="Distress channel" tone="amber">
        <ul className="grid gap-1 font-mono text-sm text-amber">
          {view.distressLog.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </StationPanel>
    </div>
  );
}
