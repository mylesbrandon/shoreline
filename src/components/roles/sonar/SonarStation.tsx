"use client";
/**
 * Sonar operator's phone screen. OWNER: Developer 4.
 * Props in (SonarView), typed actions out (onAction). No game rules here: the engine decides
 * what a ping reveals; this screen only draws `view.contacts` and emits SONAR_PING / MARK_HAZARD.
 *
 * TODO(dev4, FIRST TASK polish): animate the ping ring from lastPingOrigin; fade old contacts;
 * scope centered on the boat with range rings (SONAR.pingRange) instead of the full chart.
 */
import type { PlayerAction, SonarView } from "@/game/types";
import { SONAR } from "@/game/config";
import { CooldownButton, StationPanel } from "../instruments";

export interface SonarStationProps {
  view: SonarView;
  onAction: (action: PlayerAction) => void;
}

export function SonarStation({ view, onAction }: SonarStationProps) {
  const now = view.mission.elapsedMs;
  const active = view.mission.phase === "active";

  const mark = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onAction({ type: "MARK_HAZARD", position: { x, y } });
  };

  return (
    <div className="grid gap-3">
      <StationPanel title="Sonar scope · tap a contact to mark it for the Captain">
        <svg
          viewBox="0 0 100 100"
          className="aspect-square w-full touch-none rounded-full bg-abyss"
          onPointerDown={mark}
          role="img"
          aria-label="Sonar scope"
        >
          <defs>
            <radialGradient id="sweep" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(50)">
              <stop offset="0" stopColor="var(--color-cyan)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--color-cyan)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[12, 24, 36, 48].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--color-cyan)" strokeOpacity="0.15" />
          ))}
          <line x1="50" y1="2" x2="50" y2="98" stroke="var(--color-cyan)" strokeOpacity="0.1" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="var(--color-cyan)" strokeOpacity="0.1" />
          <g className="sonar-sweep">
            <path d="M50 50 L50 2 A48 48 0 0 1 84 16 Z" fill="url(#sweep)" />
          </g>
          {view.contacts.map((c) => (
            <g key={c.hazardId}>
              <circle cx={c.position.x * 100} cy={c.position.y * 100} r={c.radius * 100} fill="var(--color-amber)" fillOpacity="0.3" />
              <circle cx={c.position.x * 100} cy={c.position.y * 100} r="1.2" fill="var(--color-amber)" />
            </g>
          ))}
          {view.markers
            .filter((m) => m.kind === "hazard")
            .map((m) => (
              <text key={m.id} x={m.position.x * 100} y={m.position.y * 100} fill="var(--color-hazard)" fontSize="5" textAnchor="middle" dominantBaseline="middle">
                ✕
              </text>
            ))}
          <circle cx={view.boat.position.x * 100} cy={view.boat.position.y * 100} r="2" fill="var(--color-teal)" />
        </svg>
        <p className="mt-2 font-mono text-xs text-mist">
          {view.contacts.length} contact{view.contacts.length === 1 ? "" : "s"} · hull {Math.round(view.boat.hull)}%
        </p>
      </StationPanel>
      <CooldownButton
        label="Ping"
        nowMs={now}
        readyAtMs={view.pingReadyAtMs}
        cooldownMs={SONAR.pingCooldownMs}
        disabled={!active}
        onPress={() => onAction({ type: "SONAR_PING" })}
      />
    </div>
  );
}
