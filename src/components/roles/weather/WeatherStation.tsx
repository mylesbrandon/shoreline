"use client";
/**
 * Weather specialist's phone screen — PLACEHOLDER. OWNER: Developer 4.
 * Props in (WeatherView), typed actions out (onAction).
 *
 * TODO(dev4, later):
 *  - Forecast timeline: show each `weather.forecast` entry as "in Ns → current NE, strong",
 *    so the specialist can call it out to the Captain before it hits.
 *  - Storm intensity gauge and ambient rain/lightning effect.
 *  - Shield active state (shieldActiveUntilMs) with a countdown ring.
 */
import type { PlayerAction, WeatherView } from "@/game/types";
import { WEATHER } from "@/game/config";
import { CooldownButton, Dial, StationPanel } from "../instruments";

export interface WeatherStationProps {
  view: WeatherView;
  onAction: (action: PlayerAction) => void;
}

const vecAngle = (v: { x: number; y: number }) => Math.atan2(v.x, -v.y);

export function WeatherStation({ view, onAction }: WeatherStationProps) {
  const w = view.weather;
  const now = view.mission.elapsedMs;
  const currentMag = Math.hypot(w.current.x, w.current.y);

  return (
    <div className="grid gap-3">
      <StationPanel title="Conditions">
        <div className="flex justify-around">
          <Dial angle={vecAngle(w.current)} magnitude={currentMag / WEATHER.maxCurrent} label="Current" readout={`${(currentMag * 1000).toFixed(1)} kn*`} size={130} />
          <Dial angle={w.windDirection} magnitude={w.windStrength} label="Wind" readout={`${Math.round(w.windStrength * 100)}%`} size={130} color="var(--color-brass)" />
        </div>
      </StationPanel>
      <StationPanel title="Forecast (placeholder)">
        <ul className="grid gap-1 font-mono text-sm">
          {w.forecast.length === 0 && <li className="text-mist">No changes expected.</li>}
          {w.forecast.map((f) => (
            <li key={f.atMs} className="flex justify-between">
              <span className="text-mist">in {Math.max(0, Math.round((f.atMs - now) / 1000))}s</span>
              <span>current → {Math.round(((vecAngle(f.current) * 180) / Math.PI + 360) % 360)}°</span>
            </li>
          ))}
        </ul>
      </StationPanel>
      <CooldownButton
        label="Raise shield"
        tone="brass"
        nowMs={now}
        readyAtMs={w.shieldReadyAtMs}
        cooldownMs={WEATHER.shieldCooldownMs}
        disabled={view.mission.phase !== "active"}
        onPress={() => onAction({ type: "WEATHER_SHIELD" })}
      />
    </div>
  );
}
