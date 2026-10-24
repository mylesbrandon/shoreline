/**
 * Boat-centered sonar scope math. OWNER: Developer 4.
 * Pure helpers so tap → world conversion can be tested without React.
 */
import { SONAR } from "@/game/config";
import type { Vec2 } from "@/game/types";

/** World units from the boat to the edge of the circular well. Ping-range ring sits inside. */
export const SCOPE_DISPLAY_RANGE = SONAR.pingRange * 1.2;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Convert a tap on the square scope (0..1, top-left origin) to a normalized world position.
 * The well is boat-centered: the canvas midpoint is `boat`, the rim is `displayRange` away.
 */
export function scopeToWorld(tap: Vec2, boat: Vec2, displayRange: number = SCOPE_DISPLAY_RANGE): Vec2 {
  const dx = (tap.x - 0.5) * 2 * displayRange;
  const dy = (tap.y - 0.5) * 2 * displayRange;
  return {
    x: clamp01(boat.x + dx),
    y: clamp01(boat.y + dy),
  };
}

/** True when the tap lands inside the circular well (not the square's corners). */
export function tapInWell(tap: Vec2): boolean {
  const dx = tap.x - 0.5;
  const dy = tap.y - 0.5;
  return dx * dx + dy * dy <= 0.25;
}
