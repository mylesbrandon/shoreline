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
  /** A new survivor spawns at least this far from the boat whenever a valid candidate allows it. */
  minSpawnFromBoat: 0.35,
  /**
   * Candidate points generated per survivor (bounded work for any seed). With 22 hazards only ~15%
   * of the map clears the rescue-zone rule (less in the far half on some seeds), so 24 candidates
   * found no far-enough survivor ~1 time in 8 and 128 ~1 in 350; 256 missed once in 16 000 probes
   * (500 seeds × 8 survivors × 4 boat spots), and a miss still takes the farthest clear point.
   * ~5 600 distance checks, only on a rescue.
   */
  candidates: 256,
} as const;

/** Used only if every candidate lands on a hazard (unreachable with real layouts). Up the beach from the start. */
const FALLBACK_SPAWN: Vec2 = { x: 0.5, y: 0.25 };

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** A fresh, well-mixed RNG seed per (seed, index), so survivor n never depends on survivor n-1. */
const survivorSeed = (seed: number, survivorIndex: number) => (seed ^ Math.imul(survivorIndex, 0x9e3779b1)) >>> 0;

/**
 * Where survivor `survivorIndex` (0-based) of match `seed` appears.
 *
 * The candidate list and the hazard filter depend only on (seed, index, hazards) — and hazard
 * positions/radii are identical in both teams' worlds — so both teams get the same survivor for
 * the same index. The boat filter is the one input that can differ between teams: it only exists
 * so a survivor never spawns next to (or on) the boat that just made a rescue, which would give an
 * instant second rescue. It picks a different candidate only if the boats are in different places.
 */
export function survivorSpawn(seed: number, survivorIndex: number, hazards: Hazard[], boat: Vec2): Vec2 {
  if (survivorIndex <= 0) return generateLayout(seed).target;

  const rng = createRng(survivorSeed(seed, survivorIndex));
  const clear: Vec2[] = [];
  for (let i = 0; i < SURVIVORS.candidates; i++) {
    const p = {
      x: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
      y: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
    };
    // Same rescue-zone clearance the layout gives the Gull, so the survivor is always reachable.
    const blocked = hazards.some((h) => distance(p, h.position) < h.radius + TARGET.rescueRadius + LAYOUT.targetClearance);
    if (!blocked) clear.push(p);
  }

  const far = clear.find((p) => distance(p, boat) >= SURVIVORS.minSpawnFromBoat);
  if (far) return far;
  let best: Vec2 | undefined;
  for (const p of clear) if (!best || distance(p, boat) > distance(best, boat)) best = p;
  return best ?? { ...FALLBACK_SPAWN };
}
