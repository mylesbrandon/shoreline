/**
 * Versus reef formations. OWNER: Developer 1 (engine).
 *
 * Playtest r6: single scattered hazards are easy to dodge one at a time, so the Navigator ends up
 * a GPS. These add 2–3 FORMATIONS built from ordinary land hazards (reef / rock circles), so
 * collision, sonar, the Captain's lookout and every renderer work unchanged:
 * - a wall with one gap across the direct route from the docks to survivor #0 (the gap is off the
 *   straight line, so "go for the gap" or "go around" beats driving straight at the person);
 * - a horseshoe somewhere else (open on one side);
 * - sometimes a second wall with a gap.
 * A formation is only kept if, with it, both docks can still reach survivor #0 (reachability
 * grid below); otherwise it is dropped. Pure and seeded: same seed => same formations.
 */
import { MAP, TARGET } from "../config";
import type { Hazard, HazardKind, Vec2 } from "../types";
import { createRng, randomBetween, type Rng } from "./rng";

/** Engine-owned tuning (not in config.ts: nothing outside the engine depends on it). */
export const FORMATIONS = {
  /** Circles along a formation are this far apart; with radii >= 0.032 neighbours overlap into one reef. */
  spacing: 0.05,
  radius: [0.032, 0.045],
  /** Rim-to-rim width of a wall's gap. The boat is a point and turns in ~0.044 at full speed. */
  gapWidth: 0.11,
  wallLength: [0.36, 0.46],
  /** The route wall is longer, so its gap sits INSIDE it (reef on both sides) and going around is the long way. */
  routeWallLength: [0.58, 0.7],
  /** The route wall sits this far along the dock→survivor line (0 = docks, 1 = survivor). */
  routeWallAt: [0.42, 0.58],
  /**
   * Its gap centre sits this fraction of the half-length to one side of the straight line (never
   * less than minGapOffset, so the direct route stays blocked).
   */
  gapOffset: [0.35, 0.55],
  minGapOffset: 0.1,
  horseshoeRadius: [0.1, 0.13],
  /** Degrees of the horseshoe that are reef (the rest is its opening). */
  horseshoeSweepDeg: [200, 240],
  /** Keep formation rims this far from each dock and from survivor #0's rescue zone. */
  dockClearance: 0.16,
  targetClearance: 0.08,
  /** Scattered hazards whose rim comes within this of a formation circle or gap are removed. */
  scatterClearance: 0.035,
  /** Reachability grid: cell size and the extra margin kept from every hazard rim. */
  gridCell: 0.01,
  routeClearance: 0.012,
} as const;

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const LAND: readonly HazardKind[] = ["reef", "reef", "rock"];

interface Formation {
  circles: Hazard[];
  /** Centres of openings that scattered hazards must not plug. */
  openings: Vec2[];
}

/** Circles along a straight wall centred on `c`, along unit vector `u`, minus a gap at `gapAt` (along u). */
function wall(rng: Rng, id: string, c: Vec2, u: Vec2, length: number, gapAt: number): Formation {
  const circles: Hazard[] = [];
  const steps = Math.floor(length / FORMATIONS.spacing);
  for (let i = 0; i <= steps; i++) {
    const t = -length / 2 + i * FORMATIONS.spacing;
    const radius = randomBetween(rng, FORMATIONS.radius[0], FORMATIONS.radius[1]);
    const jitter = randomBetween(rng, -0.01, 0.01);
    const kind = LAND[Math.floor(rng() * LAND.length)] ?? "reef";
    if (Math.abs(t - gapAt) < FORMATIONS.gapWidth / 2 + radius) continue;
    circles.push(land(`${id}-${i}`, kind, { x: c.x + u.x * t - u.y * jitter, y: c.y + u.y * t + u.x * jitter }, radius));
  }
  return { circles, openings: [{ x: c.x + u.x * gapAt, y: c.y + u.y * gapAt }] };
}

/** Circles along an arc of radius `r` around `c`, open (no reef) around angle `openAt` (radians). */
function horseshoe(rng: Rng, id: string, c: Vec2, r: number, openAt: number): Formation {
  const sweep = (randomBetween(rng, FORMATIONS.horseshoeSweepDeg[0], FORMATIONS.horseshoeSweepDeg[1]) * Math.PI) / 180;
  const start = openAt + Math.PI - sweep / 2;
  const steps = Math.max(2, Math.round((sweep * r) / FORMATIONS.spacing));
  const circles: Hazard[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    const radius = randomBetween(rng, FORMATIONS.radius[0], FORMATIONS.radius[1]);
    const kind = LAND[Math.floor(rng() * LAND.length)] ?? "reef";
    circles.push(land(`${id}-${i}`, kind, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, radius));
  }
  return { circles, openings: [{ x: c.x + Math.cos(openAt) * r, y: c.y + Math.sin(openAt) * r }, { ...c }] };
}

function land(id: string, kind: HazardKind, position: Vec2, radius: number): Hazard {
  return { id, kind, position, radius, revealed: false, lastHitAtMs: null };
}

/** Drop circles too close to a dock, survivor #0 or the map edge (cutting a formation never closes a route). */
function clip(f: Formation, docks: readonly Vec2[], target: Vec2): Formation {
  const ok = (h: Hazard) =>
    docks.every((d) => distance(h.position, d) >= h.radius + FORMATIONS.dockClearance) &&
    distance(h.position, target) >= h.radius + TARGET.rescueRadius + FORMATIONS.targetClearance &&
    h.position.x - h.radius >= MAP.edgePadding &&
    h.position.x + h.radius <= 1 - MAP.edgePadding &&
    h.position.y - h.radius >= MAP.edgePadding &&
    h.position.y + h.radius <= 1 - MAP.edgePadding;
  return { ...f, circles: f.circles.filter(ok) };
}

/**
 * A boat-reachability grid over the map: cells whose centre keeps `routeClearance` from every
 * hazard rim (all kinds: a route through jellyfish is not a safe route), flood-filled from
 * `from`. `reaches(p)` is true when the cell containing p is connected to a start.
 */
export function reachability(hazards: readonly Hazard[], from: readonly Vec2[]): { reaches: (p: Vec2) => boolean } {
  const n = Math.round(1 / FORMATIONS.gridCell);
  const cellOf = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  const open = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = { x: (x + 0.5) / n, y: (y + 0.5) / n };
      const inside = p.x >= MAP.edgePadding && p.x <= 1 - MAP.edgePadding && p.y >= MAP.edgePadding && p.y <= 1 - MAP.edgePadding;
      if (inside && hazards.every((h) => distance(p, h.position) >= h.radius + FORMATIONS.routeClearance)) open[y * n + x] = 1;
    }
  }
  const seen = new Uint8Array(n * n);
  const queue: number[] = [];
  for (const s of from) {
    const i = cellOf(s.y) * n + cellOf(s.x);
    if (open[i] && !seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    const x = i % n;
    const y = (i - x) / n;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (open[j] && !seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return { reaches: (p) => seen[cellOf(p.y) * n + cellOf(p.x)] === 1 };
}

/** True when every dock can drive to within the rescue zone of `target` without touching a hazard. */
export function docksReach(hazards: readonly Hazard[], docks: readonly Vec2[], target: Vec2, rescueRadius: number): boolean {
  const zone: Vec2[] = [];
  for (let a = 0; a < 16; a++) {
    const angle = (a / 16) * Math.PI * 2;
    zone.push({ x: target.x + Math.cos(angle) * rescueRadius * 0.7, y: target.y + Math.sin(angle) * rescueRadius * 0.7 });
  }
  zone.push(target);
  return docks.every((d) => zone.some(reachability(hazards, [d]).reaches));
}

/**
 * The versus hazard field: `base` (the seeded co-op layout) plus reef formations, with scattered
 * hazards that would crowd a formation or plug one of its openings removed. Deterministic in
 * `seed`; both crews call it with the same inputs, so both get the identical field.
 */
export function withFormations(seed: number, base: readonly Hazard[], docks: readonly Vec2[], target: Vec2, rescueRadius: number): Hazard[] {
  const rng = createRng((seed ^ 0x5eef0f) >>> 0);
  const mid = { x: docks.reduce((s, d) => s + d.x, 0) / docks.length, y: docks.reduce((s, d) => s + d.y, 0) / docks.length };
  const along = { x: target.x - mid.x, y: target.y - mid.y };
  const span = Math.hypot(along.x, along.y) || 1;
  const forward = { x: along.x / span, y: along.y / span };
  const across = { x: -forward.y, y: forward.x };
  const side = rng() < 0.5 ? -1 : 1;

  const candidates: Formation[] = [];
  // 1. Across the direct route, gap off to one side.
  const at = randomBetween(rng, FORMATIONS.routeWallAt[0], FORMATIONS.routeWallAt[1]);
  const routeLength = randomBetween(rng, FORMATIONS.routeWallLength[0], FORMATIONS.routeWallLength[1]);
  const gapAt = Math.max(FORMATIONS.minGapOffset, (routeLength / 2) * randomBetween(rng, FORMATIONS.gapOffset[0], FORMATIONS.gapOffset[1]));
  candidates.push(wall(rng, "f1", { x: mid.x + along.x * at, y: mid.y + along.y * at }, across, routeLength, side * gapAt));
  // 2. A horseshoe on the other side of the map from the route, opening toward the middle.
  const hx = side > 0 ? randomBetween(rng, 0.2, 0.32) : randomBetween(rng, 0.68, 0.8);
  const hc = { x: hx, y: randomBetween(rng, 0.25, 0.55) };
  candidates.push(
    horseshoe(rng, "f2", hc, randomBetween(rng, FORMATIONS.horseshoeRadius[0], FORMATIONS.horseshoeRadius[1]), Math.atan2(0.5 - hc.y, 0.5 - hc.x)),
  );
  // 3. Sometimes a second, shorter wall with a gap, at a random angle in the upper half.
  if (rng() < 0.6) {
    const angle = rng() * Math.PI;
    const length = randomBetween(rng, FORMATIONS.wallLength[0] * 0.75, FORMATIONS.wallLength[1] * 0.75);
    candidates.push(
      wall(rng, "f3", { x: randomBetween(rng, 0.3, 0.7), y: randomBetween(rng, 0.15, 0.35) }, { x: Math.cos(angle), y: Math.sin(angle) }, length, randomBetween(rng, -length / 4, length / 4)),
    );
  }

  let field: Hazard[] = [...base];
  for (const candidate of candidates) {
    const f = clip(candidate, docks, target);
    if (f.circles.length < 3) continue;
    const crowds = (h: Hazard) =>
      f.circles.some((c) => distance(h.position, c.position) < h.radius + c.radius + FORMATIONS.scatterClearance) ||
      f.openings.some((o) => distance(h.position, o) < h.radius + FORMATIONS.gapWidth / 2 + FORMATIONS.scatterClearance);
    // Formation circles from earlier formations stay; only the seeded scatter makes room.
    const next = [...field.filter((h) => h.id.startsWith("f") || !crowds(h)), ...f.circles];
    if (docksReach(next, docks, target, rescueRadius)) field = next;
  }
  return field;
}
