/**
 * Deterministic seeded RNG (mulberry32). The engine must NEVER call Math.random() or Date.now():
 * same seed + same actions + same dt sequence => same GameState. That makes tests trivial and
 * lets the host restore/replay.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
