/**
 * Fixed-timestep simulation. OWNER: Developer 1 (engine).
 *
 * The host calls step(state, 1000 / NETWORK.simHz) ~30 times per second.
 * Pure: same input => same output. No Date.now(), no Math.random().
 */
import { BOAT, MAP, WEATHER } from "../config";
import type { BoatState, GameEvent, GameState, Vec2, WeatherState } from "../types";

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

  // TODO(dev1, later): hazard collisions, rescue check, score.

  let mission = { ...state.mission, elapsedMs };
  if (elapsedMs >= state.mission.durationMs) {
    mission = { ...mission, elapsedMs: state.mission.durationMs, phase: "failure", failureReason: "timeout" };
  }
  const weather = applyForecast(state.weather, mission.elapsedMs, events);
  if (mission.phase === "failure") {
    events.push({ type: "MISSION_ENDED", phase: "failure", reason: "timeout", atMs: mission.elapsedMs });
  }

  return { state: { ...state, tick: state.tick + 1, boat, weather, mission }, events };
}
