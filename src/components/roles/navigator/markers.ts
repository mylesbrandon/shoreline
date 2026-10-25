/**
 * Hazard-mark rules for the Navigator UI. OWNER: Developer 4.
 * The cap and the tap-to-remove radius come from the versus contract, which the engine enforces;
 * this only decides what to say and whether a tap will place or remove.
 */
import type { Marker, Vec2 } from "@/game/types";
import { VERSUS } from "@/game/versus/contract";

export const MAX_HAZARD_MARKS = VERSUS.maxHazardMarks;

/** Count of hazard marks currently on the shared map (from the sonar view). Radio pins never count. */
export function hazardMarkCount(markers: readonly { kind: string }[]): number {
  return markers.filter((m) => m.kind === "hazard").length;
}

/** The crew's hazard mark a tap at `p` would remove (same rule as the engine), or null. */
export function hazardMarkAt(markers: readonly Marker[], p: Vec2): Marker | null {
  let best: Marker | null = null;
  let bestGap = Infinity;
  for (const m of markers) {
    if (m.kind !== "hazard") continue;
    const gap = Math.hypot(m.position.x - p.x, m.position.y - p.y);
    if (gap <= VERSUS.markRemoveRadius && gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best;
}

export type MarkIntent = "remove" | "place" | "full";

/** What a mark tap at `p` will do: remove the mark under it, place a new one, or nothing (cap reached). */
export function markIntent(markers: readonly Marker[], p: Vec2): MarkIntent {
  if (hazardMarkAt(markers, p)) return "remove";
  return hazardMarkCount(markers) >= MAX_HAZARD_MARKS ? "full" : "place";
}
