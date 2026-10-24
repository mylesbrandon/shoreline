/**
 * Seeded mission layout: hazards, rescue target and weather. OWNER: Developer 1 (engine).
 *
 * Pure and deterministic: the same seed always gives the same layout (createRng, no Math.random()).
 * Every layout is playable: the Gull is far from the start, nothing spawns on the boat or the Gull,
 * and a hazard-free channel always runs from the start to the Gull (via a random bend).
 */
import { HAZARDS, MISSION, TARGET, WEATHER } from "../config";
import type { CurrentForecastEntry, Hazard, HazardKind, Vec2, WeatherState } from "../types";
import { createRng, randomBetween, type Rng } from "./rng";

/** Engine-owned layout tuning (not in config.ts: nothing outside the engine depends on it). */
export const LAYOUT = {
  /** Keep spawned things this far inside the map edge. */
  margin: 0.08,
  /** The Gull spawns at least this far from the boat start. */
  minTargetDistance: 0.55,
  /** No hazard within this distance of the boat start (plus its radius). */
  startClearance: 0.15,
  /** No hazard within rescueRadius + this of the Gull (plus its radius), so the rescue zone is reachable. */
  targetClearance: 0.06,
  /** Gap between neighbouring hazards' rims. */
  hazardGap: 0.02,
  /** Half-width of the guaranteed hazard-free channel from the start to the Gull. */
  channelHalfWidth: 0.06,
  /** Give up placing a hazard after this many tries (keeps generation bounded for any seed). */
  maxAttempts: 2_000,
  /** First current shift lands in this window; later shifts follow every shiftEveryMs. */
  firstShiftMs: [12_000, 18_000],
  shiftEveryMs: [12_000, 20_000],
  /** No shift in the last few seconds; it couldn't matter any more. */
  lastShiftBeforeEndMs: 5_000,
  /** Current strength as a fraction of WEATHER.maxCurrent: gentle at the start, up to full later. */
  startCurrent: [0.3, 0.6],
  shiftCurrent: [0.35, 1],
} as const;

/** Kinds by weight: reefs are the classic hazard, debris the rarest. */
const KINDS: readonly HazardKind[] = ["reef", "reef", "reef", "rock", "rock", "debris"];

export interface Layout {
  hazards: Hazard[];
  target: Vec2;
  weather: WeatherState;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from point p to the segment a–b. */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

const pointInMap = (rng: Rng): Vec2 => ({
  x: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
  y: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
});

/** A current vector `strength` × maxCurrent, flowing toward `direction` (radians, 0 = north, clockwise). */
function currentToward(direction: number, strength: number): Vec2 {
  const speed = strength * WEATHER.maxCurrent;
  return { x: Math.sin(direction) * speed, y: -Math.cos(direction) * speed };
}

function pickTarget(rng: Rng, start: Vec2): Vec2 {
  for (let i = 0; i < LAYOUT.maxAttempts; i++) {
    const p = pointInMap(rng);
    if (distance(p, start) >= LAYOUT.minTargetDistance) return p;
  }
  // Unreachable in practice (most of the top half qualifies); keeps the function total.
  return { x: 1 - LAYOUT.margin, y: LAYOUT.margin };
}

function placeHazards(rng: Rng, start: Vec2, target: Vec2, channel: Vec2[]): Hazard[] {
  const hazards: Hazard[] = [];
  for (let attempt = 0; attempt < LAYOUT.maxAttempts && hazards.length < HAZARDS.count; attempt++) {
    const radius = randomBetween(rng, HAZARDS.minRadius, HAZARDS.maxRadius);
    const position = pointInMap(rng);
    const kind = KINDS[Math.floor(rng() * KINDS.length)] ?? "reef";
    const blocksChannel = channel.some((a, i) => {
      const b = channel[i + 1];
      return b !== undefined && distanceToSegment(position, a, b) < LAYOUT.channelHalfWidth + radius;
    });
    if (
      blocksChannel ||
      distance(position, start) < LAYOUT.startClearance + radius ||
      distance(position, target) < TARGET.rescueRadius + LAYOUT.targetClearance + radius ||
      hazards.some((h) => distance(position, h.position) < h.radius + radius + LAYOUT.hazardGap)
    ) {
      continue;
    }
    hazards.push({ id: `h${hazards.length + 1}`, kind, position, radius, revealed: false, lastHitAtMs: null });
  }
  return hazards;
}

function generateWeather(rng: Rng): WeatherState {
  const direction = rng() * 2 * Math.PI;
  const strength = randomBetween(rng, LAYOUT.startCurrent[0], LAYOUT.startCurrent[1]);

  const forecast: CurrentForecastEntry[] = [];
  const lastAtMs = MISSION.durationMs - LAYOUT.lastShiftBeforeEndMs;
  let atMs = randomBetween(rng, LAYOUT.firstShiftMs[0], LAYOUT.firstShiftMs[1]);
  while (atMs < lastAtMs) {
    const shift = currentToward(rng() * 2 * Math.PI, randomBetween(rng, LAYOUT.shiftCurrent[0], LAYOUT.shiftCurrent[1]));
    forecast.push({ atMs: Math.round(atMs), current: shift });
    atMs += randomBetween(rng, LAYOUT.shiftEveryMs[0], LAYOUT.shiftEveryMs[1]);
  }

  return {
    // The wind blows the way the opening current flows (same angle convention as heading).
    windDirection: direction,
    windStrength: strength,
    current: currentToward(direction, strength),
    forecast,
    stormIntensity: randomBetween(rng, 0.3, 0.7),
    shieldActiveUntilMs: null,
    shieldReadyAtMs: 0,
  };
}

/**
 * Build the whole layout from one seed. The channel bends through a random waypoint between the
 * start and the Gull, so it isn't simply "drive straight at it".
 */
export function generateLayout(seed: number): Layout {
  const rng = createRng(seed);
  const start = { x: MISSION.boatStart.x, y: MISSION.boatStart.y };
  const target = pickTarget(rng, start);
  const bend = {
    x: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
    y: randomBetween(rng, Math.min(start.y, target.y), Math.max(start.y, target.y)),
  };
  const hazards = placeHazards(rng, start, target, [start, bend, target]);
  return { hazards, target, weather: generateWeather(rng) };
}
