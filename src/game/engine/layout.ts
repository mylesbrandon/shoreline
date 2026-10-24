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
  /**
   * Weather is a calm base current plus short gusts (playtest: a few long shifts gave Weather one
   * decision every ~20 s). Each gust is two forecast entries: base + gust at the start, base again
   * after gustDurationMs. Strengths are map units / second.
   */
  baseCurrent: [0, 0.01],
  gustCount: [10, 12],
  gustDurationMs: 3_000,
  gustStrength: [0.015, 0.03],
  /** Gust starts are 6–10 s apart (start to start), so there's always calm water between them. */
  gustEveryMs: [6_000, 10_000],
  firstGustMs: [4_000, 7_000],
  /** Every gust has ended this long before the mission does; a late one couldn't matter. */
  lastShiftBeforeEndMs: 5_000,
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

/** A current of `speed` map units / second flowing toward `direction` (radians, 0 = north, clockwise). */
function currentToward(direction: number, speed: number): Vec2 {
  return { x: Math.sin(direction) * speed, y: -Math.cos(direction) * speed };
}

/** Scale a current down to WEATHER.maxCurrent if base + gust overshoots it. */
function capCurrent(v: Vec2): Vec2 {
  const speed = Math.hypot(v.x, v.y);
  return speed <= WEATHER.maxCurrent ? v : { x: (v.x / speed) * WEATHER.maxCurrent, y: (v.y / speed) * WEATHER.maxCurrent };
}

function pickTarget(rng: Rng, start: Vec2): Vec2 {
  for (let i = 0; i < LAYOUT.maxAttempts; i++) {
    const p = pointInMap(rng);
    if (distance(p, start) >= LAYOUT.minTargetDistance) return p;
  }
  // Unreachable in practice (most of the top half qualifies); keeps the function total.
  return { x: 1 - LAYOUT.margin, y: LAYOUT.margin };
}

function placeHazards(rng: Rng, start: Vec2, target: Vec2, channel: Vec2[], count: number): Hazard[] {
  const hazards: Hazard[] = [];
  for (let attempt = 0; attempt < LAYOUT.maxAttempts && hazards.length < count; attempt++) {
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
  const base = currentToward(direction, randomBetween(rng, LAYOUT.baseCurrent[0], LAYOUT.baseCurrent[1]));

  // Spread the gusts so all of them fit: no gap may exceed the even share of the available time,
  // which guarantees gustCount gusts that each end before lastShiftBeforeEndMs.
  const count = LAYOUT.gustCount[0] + Math.floor(rng() * (LAYOUT.gustCount[1] - LAYOUT.gustCount[0] + 1));
  const firstAtMs = randomBetween(rng, LAYOUT.firstGustMs[0], LAYOUT.firstGustMs[1]);
  const lastStartMs = MISSION.durationMs - LAYOUT.lastShiftBeforeEndMs - LAYOUT.gustDurationMs;
  const maxGapMs = Math.min(LAYOUT.gustEveryMs[1], (lastStartMs - firstAtMs) / (count - 1));

  const forecast: CurrentForecastEntry[] = [];
  let startMs = firstAtMs;
  for (let i = 0; i < count; i++) {
    if (i > 0) startMs += randomBetween(rng, LAYOUT.gustEveryMs[0], maxGapMs);
    const gust = currentToward(rng() * 2 * Math.PI, randomBetween(rng, LAYOUT.gustStrength[0], LAYOUT.gustStrength[1]));
    const atMs = Math.round(startMs);
    forecast.push({ atMs, current: capCurrent({ x: base.x + gust.x, y: base.y + gust.y }) });
    forecast.push({ atMs: atMs + LAYOUT.gustDurationMs, current: base });
  }

  return {
    // The wind blows the way the base current flows (same angle convention as heading).
    windDirection: direction,
    windStrength: Math.hypot(base.x, base.y) / WEATHER.maxCurrent,
    current: base,
    forecast,
    stormIntensity: randomBetween(rng, 0.3, 0.7),
    shieldActiveUntilMs: null,
    shieldReadyAtMs: 0,
  };
}

/**
 * Build the whole layout from one seed (`hazardCount` lets tests try a denser field before the
 * shared config changes). The channel bends through a random waypoint between the
 * start and the Gull, so it isn't simply "drive straight at it".
 */
export function generateLayout(seed: number, hazardCount: number = HAZARDS.count): Layout {
  const rng = createRng(seed);
  const start = { x: MISSION.boatStart.x, y: MISSION.boatStart.y };
  const target = pickTarget(rng, start);
  const bend = {
    x: randomBetween(rng, LAYOUT.margin, 1 - LAYOUT.margin),
    y: randomBetween(rng, Math.min(start.y, target.y), Math.max(start.y, target.y)),
  };
  const hazards = placeHazards(rng, start, target, [start, bend, target], hazardCount);
  return { hazards, target, weather: generateWeather(rng) };
}
