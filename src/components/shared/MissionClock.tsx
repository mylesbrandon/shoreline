/**
 * Mission countdown readout. OWNER: Developer 2 (shared chrome).
 */
import type { MissionState } from "@/game/types";

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MissionClock({ mission, className = "" }: { mission: MissionState; className?: string }) {
  const remaining = mission.durationMs - mission.elapsedMs;
  const urgent = mission.phase === "active" && remaining < 15_000;
  return (
    <span className={`font-mono tabular-nums ${urgent ? "text-hazard" : "text-foam"} ${className}`}>
      {formatClock(remaining)}
    </span>
  );
}
