/**
 * Fixed-timestep simulation. OWNER: Developer 1 (engine).
 *
 * The host calls step(state, 1000 / NETWORK.simHz) ~30 times per second.
 * Pure: same input => same output. No Date.now(), no Math.random().
 */
import { BOAT, MAP, WEATHER } from "../config";
import type { BoatState, FailureReason, GameEvent, GameState, Hazard, MissionState, Vec2, WeatherState } from "../types";
import { scoreMission } from "./score";

const TWO_PI = Math.PI * 2;

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/** Wrap an angle in radians into [0, 2π). */
export function normalizeAngle(angle: number): number {
  const wrapped = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  // Floating-point: (tiny negative + 2π) % 2π can round to exactly 2π.
  return wrapped >= TWO_PI ? 0 : wrapped;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** True while the weather shield is up at mission time `elapsedMs`. */
export function isShieldActive(weather: WeatherState, elapsedMs: number): boolean {
  return weather.shieldActiveUntilMs !== null && elapsedMs < weather.shieldActiveUntilMs;
}

/** The current actually pushing the boat: dampened while the shield is up. */
export function effectiveCurrent(weather: WeatherState, elapsedMs: number): Vec2 {
  if (!isShieldActive(weather, elapsedMs)) return weather.current;
  return { x: weather.current.x * WEATHER.shieldCurrentFactor, y: weather.current.y * WEATHER.shieldCurrentFactor };
}

/**
 * Advance the boat by dt seconds using its current throttle and rudder, drifting with `current`
 * (map units / second). Semi-implicit Euler: speed is updated first, then heading and position
 * use the new speed.
 */
export function stepBoat(boat: BoatState, dt: number, current: Vec2): BoatState {
  // 1. Speed eases toward throttle * maxSpeed, by at most acceleration * dt (no overshoot).
  const targetSpeed = boat.throttle * BOAT.maxSpeed;
  const maxDelta = BOAT.acceleration * dt;
  const delta = targetSpeed - boat.speed;
  // Snap exactly onto the target when it's within reach, so speed settles at e.g. maxSpeed precisely.
  const speed = Math.max(0, Math.abs(delta) <= maxDelta ? targetSpeed : boat.speed + Math.sign(delta) * maxDelta);

  // 2. Turning scales with speed: a stopped boat can't turn.
  const heading = normalizeAngle(boat.heading + boat.rudder * BOAT.maxTurnRate * (speed / BOAT.maxSpeed) * dt);

  // 3. Move along the heading plus the current. Heading 0 = north = -y; +y is south.
  // The current only displaces the boat; it never rotates the heading.
  const min = MAP.edgePadding;
  const max = 1 - MAP.edgePadding;
  const position = {
    x: clamp(boat.position.x + (Math.sin(heading) * speed + current.x) * dt, min, max),
    y: clamp(boat.position.y + (-Math.cos(heading) * speed + current.y) * dt, min, max),
  };

  return { ...boat, speed, heading, position };
}

/**
 * Apply every forecast entry whose atMs has been reached by `elapsedMs`. The latest one becomes
 * the current; each applied entry emits its own CURRENT_SHIFTED (stamped with its scheduled atMs).
 */
function applyForecast(weather: WeatherState, elapsedMs: number, events: GameEvent[]): WeatherState {
  const due = weather.forecast.filter((entry) => entry.atMs <= elapsedMs);
  const last = due.at(-1);
  if (!last) return weather;
  for (const entry of due) events.push({ type: "CURRENT_SHIFTED", current: entry.current, atMs: entry.atMs });
  return { ...weather, current: last.current, forecast: weather.forecast.filter((entry) => entry.atMs > elapsedMs) };
}

export function step(state: GameState, dtMs: number): StepResult {
  if (state.mission.phase !== "active") return { state, events: [] };

  const events: GameEvent[] = [];
  const elapsedMs = state.mission.elapsedMs + dtMs;
  // Explicit in time: this step moves with the current and shield as they were at its start;
  // forecast shifts reached during the step take effect from the next one.
  const boat = stepBoat(state.boat, dtMs / 1000, effectiveCurrent(state.weather, state.mission.elapsedMs));

  const mission = { ...state.mission, elapsedMs: Math.min(elapsedMs, state.mission.durationMs) };
  const hit = applyCollisions(state.hazards, boat, mission.elapsedMs, events);
  const weather = applyForecast(state.weather, mission.elapsedMs, events);
  const target = { ...state.target, position: driftGull(state.target.position, state.weather.current, state.hazards, dtMs / 1000) };
  const next: GameState = {
    ...state,
    tick: state.tick + 1,
    boat: hit.boat,
    hazards: hit.hazards,
    weather,
    target,
    mission,
    stats: hit.count > 0 ? { ...state.stats, hazardsHit: state.stats.hazardsHit + hit.count } : state.stats,
  };

  // Several endings in one step: a sunk boat can't rescue anyone, and reaching the Gull on the
  // final step still counts. So hull_destroyed > victory > timeout.
  if (hit.boat.hull <= 0) {
    return {
      state: endMission(next, "failure", "hull_destroyed"),
      events: [...events, ended(mission, "failure", "hull_destroyed")],
    };
  }
  const rescued = distance(boat.position, target.position) <= target.rescueRadius;
  if (rescued) return { state: endMission(next, "victory", null), events: [...events, ended(mission, "victory", null)] };
  if (elapsedMs >= state.mission.durationMs) {
    return { state: endMission(next, "failure", "timeout"), events: [...events, ended(mission, "failure", "timeout")] };
  }
  return { state: next, events };
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Engine-owned Gull drift tuning (not in config.ts: nothing outside the engine depends on it). */
export const GULL_DRIFT = {
  /** The Gull moves at this fraction of the raw current (the shield only protects the boat). */
  currentFactor: 0.3,
  /** Kept inside [margin, 1 - margin] on both axes. */
  margin: 0.08,
  /** The Gull never drifts closer than this to a hazard's rim, so it can't end up unreachable. */
  hazardClearance: 0.05,
} as const;

/**
 * The Gull drifts with the current, so Radio's fix goes stale and they have to keep tracking.
 * A drift step that would take it within GULL_DRIFT.hazardClearance of a hazard (and closer than
 * it already is) is skipped, which pauses it there until the current turns.
 */
function driftGull(position: Vec2, current: Vec2, hazards: Hazard[], dt: number): Vec2 {
  const clampAxis = (v: number) => Math.min(1 - GULL_DRIFT.margin, Math.max(GULL_DRIFT.margin, v));
  const next = {
    x: clampAxis(position.x + current.x * GULL_DRIFT.currentFactor * dt),
    y: clampAxis(position.y + current.y * GULL_DRIFT.currentFactor * dt),
  };
  const crowds = hazards.some(
    (h) =>
      distance(next, h.position) < h.radius + GULL_DRIFT.hazardClearance &&
      distance(next, h.position) < distance(position, h.position),
  );
  return crowds ? position : next;
}

/**
 * Damage the hull once for every hazard the boat is inside, then ignore that hazard for
 * BOAT.collisionCooldownMs (via Hazard.lastHitAtMs) so sitting on a reef isn't 25 damage a frame.
 * A hit also reveals the hazard: the crew has seen it up close.
 */
function applyCollisions(
  hazards: Hazard[],
  boat: BoatState,
  atMs: number,
  events: GameEvent[],
): { boat: BoatState; hazards: Hazard[]; count: number } {
  let hull = boat.hull;
  let count = 0;
  const next = hazards.map((h) => {
    const coolingDown = h.lastHitAtMs !== null && atMs - h.lastHitAtMs < BOAT.collisionCooldownMs;
    if (hull <= 0 || coolingDown || distance(boat.position, h.position) >= h.radius) return h;
    const damage = Math.min(BOAT.collisionDamage, hull);
    hull -= damage;
    count++;
    events.push({ type: "HAZARD_HIT", hazardId: h.id, damage, atMs });
    return { ...h, revealed: true, lastHitAtMs: atMs };
  });
  return count === 0 ? { boat, hazards, count } : { boat: { ...boat, hull }, hazards: next, count };
}

function endMission(state: GameState, phase: "victory" | "failure", failureReason: FailureReason | null): GameState {
  return { ...state, mission: { ...state.mission, phase, failureReason, score: scoreMission(state, phase) } };
}

function ended(mission: MissionState, phase: "victory" | "failure", reason: FailureReason | null): GameEvent {
  return { type: "MISSION_ENDED", phase, reason, atMs: mission.elapsedMs };
}
