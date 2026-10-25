/**
 * Versus survivor sequence. OWNER: Developer 1 (engine).
 *
 * Each versus world keeps the co-op single `GameState.target`; when a team reaches it, the next
 * survivor in this sequence takes its place. Survivor #0 is the layout's Gull. Every later one is
 * derived only from (seed, survivorIndex), never from the world's state, so both teams get the
 * same survivor positions in the same order.
 *
 * Pure and deterministic: every random draw comes from createRng.
 */
import { TARGET } from "../config";
import type { Hazard, Vec2 } from "../types";
import { generateLayout, LAYOUT } from "./layout";
import { createRng, randomBetween } from "./rng";

/** Engine-owned tuning (not in config.ts: nothing outside the engine depends on it). */
export const SURVIVORS = {
  /** A new survivor spawns at least this far from every boat whenever a valid candidate allows it. */
  minSpawnFromBoat: 0.35,
  /**
   * Fallback when no candidate is minSpawnFromBoat from BOTH versus boats (~10% of spawns: dense
   * hazards and boats at opposite ends leave little room). Still > 3x the pickup radius, so no
   * instant rescue; before this tier the worst miss was 0.09 from a boat.
   */
  minSpawnFromAnyBoat: 0.2,
  /**
   * Candidate points generated per survivor (bounded work for any seed). With 22 hazards only ~15%
   * of the map clears the rescue-zone rule. Versus spawns away from BOTH boats, which leaves less
   * room: at 512 (with the minSpawnFromAnyBoat tier) 16 of 7 200 probes (300 seeds × 8 survivors ×
   * 3 boat pairs) landed under 0.2 from a boat, the worst at 0.13 (still 2x the pickup radius).
   * ~11 000 distance checks, only on a rescue.
   */
  candidates: 512,
} as const;

/** Used only if every candidate lands on a hazard (unreachable with real layouts). Up the beach from the start. */
const FALLBACK_SPAWN: Vec2 = { x: 0.5, y: 0.25 };

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** A fresh, well-mixed RNG seed per (seed, index), so survivor n never depends on survivor n-1. */
const survivorSeed = (seed: number, survivorIndex: number) => (seed ^ Math.imul(survivorIndex, 0x9e3779b1)) >>> 0;

/**
 * Where survivor `survivorIndex` (0-based) of match `seed` appears, at least
 * SURVIVORS.minSpawnFromBoat from every boat in `boats` when a candidate allows it.
 *
 * The candidate list and the hazard filter depend only on (seed, index, hazards), and hazard
 * positions/radii are identical in both teams' worlds. Versus spawns each survivor once for the
 * whole match (both crews race for it) and passes both boats, so the boat filter keeps it away
 * from everyone: a survivor next to (or under) a boat would be an instant pickup.
 */
export function survivorSpawn(
  seed: number,
  survivorIndex: number,
  hazards: Hazard[],
  boats: Vec2 | readonly Vec2[],
  rescueRadius: number = TARGET.rescueRadius,
  /** Extra filter on candidates (versus: reachable from the docks through the reef formations). */
  accept: (p: Vec2) => boolean = () => true,
): Vec2 {
  if (survivorIndex <= 0) return generateLayout(seed).target;

  const rng = createRng(survivorSeed(seed, survivorIndex));
  const clear: Vec2[] = [];
  for (let i = 0; i < SURVIVORS.candidates; i++) {
    const p = {
      x: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
      y: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
    };
    // Same rescue-zone clearance the layout gives the Gull, so the survivor is always reachable.
    const blocked = hazards.some((h) => distance(p, h.position) < h.radius + rescueRadius + LAYOUT.targetClearance);
    if (!blocked && accept(p)) clear.push(p);
  }

  // With several boats (versus: both crews race for the same survivor), "far from the boat" means
  // far from the nearest one, so nobody gets an instant pickup.
  const all: readonly Vec2[] = Array.isArray(boats) ? boats : [boats as Vec2];
  const fromBoats = (p: Vec2) => Math.min(...all.map((b) => distance(p, b)));
  const far =
    clear.find((p) => fromBoats(p) >= SURVIVORS.minSpawnFromBoat) ??
    clear.find((p) => fromBoats(p) >= SURVIVORS.minSpawnFromAnyBoat);
  if (far) return far;
  let best: Vec2 | undefined;
  for (const p of clear) if (!best || fromBoats(p) > fromBoats(best)) best = p;
  return best ?? { ...FALLBACK_SPAWN };
}
