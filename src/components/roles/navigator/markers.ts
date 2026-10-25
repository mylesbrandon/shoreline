/**
 * Marker limits for the Navigator UI. OWNER: Developer 4.
 * Mirrors `MARKERS.maxHazardMarks` in the engine — roles must not import `@/game/engine`.
 */
export const MAX_HAZARD_MARKS = 8;

/** Count of hazard marks currently on the shared map (from the sonar view). */
export function hazardMarkCount(markers: readonly { kind: string }[]): number {
  return markers.filter((m) => m.kind === "hazard").length;
}
