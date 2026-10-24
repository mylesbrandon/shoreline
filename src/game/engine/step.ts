/**
 * Fixed-timestep simulation. OWNER: Developer 1 (engine).
 *
 * The host calls step(state, 1000 / NETWORK.simHz) ~30 times per second.
 * Pure: same input => same output. No Date.now(), no Math.random().
 */
import { BOAT, MAP } from "../config";
import type { BoatState, GameEvent, GameState } from "../types";

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

/**
 * Advance the boat by dt seconds using its current throttle and rudder.
 * Semi-implicit Euler: speed is updated first, then heading and position use the new speed.
 */
export function stepBoat(boat: BoatState, dt: number): BoatState {
  // 1. Speed eases toward throttle * maxSpeed, by at most acceleration * dt (no overshoot).
  const targetSpeed = boat.throttle * BOAT.maxSpeed;
  const maxDelta = BOAT.acceleration * dt;
  const delta = targetSpeed - boat.speed;
  // Snap exactly onto the target when it's within reach, so speed settles at e.g. maxSpeed precisely.
  const speed = Math.max(0, Math.abs(delta) <= maxDelta ? targetSpeed : boat.speed + Math.sign(delta) * maxDelta);

  // 2. Turning scales with speed: a stopped boat can't turn.
  const heading = normalizeAngle(boat.heading + boat.rudder * BOAT.maxTurnRate * (speed / BOAT.maxSpeed) * dt);

  // 3. Move along the heading. Heading 0 = north = -y; +y is south.
  // TODO(dev1, next): add the weather current here (state.weather.current, scaled by
  // WEATHER.shieldCurrentFactor while the shield is active), before clamping.
  const min = MAP.edgePadding;
  const max = 1 - MAP.edgePadding;
  const position = {
    x: clamp(boat.position.x + Math.sin(heading) * speed * dt, min, max),
    y: clamp(boat.position.y - Math.cos(heading) * speed * dt, min, max),
  };

  return { ...boat, speed, heading, position };
}

export function step(state: GameState, dtMs: number): StepResult {
  if (state.mission.phase !== "active") return { state, events: [] };

  const events: GameEvent[] = [];
  const elapsedMs = state.mission.elapsedMs + dtMs;
  const boat = stepBoat(state.boat, dtMs / 1000);

  // TODO(dev1, later): hazard collisions, current forecast shifts, rescue check, score.

  let mission = { ...state.mission, elapsedMs };
  if (elapsedMs >= state.mission.durationMs) {
    mission = { ...mission, elapsedMs: state.mission.durationMs, phase: "failure", failureReason: "timeout" };
    events.push({ type: "MISSION_ENDED", phase: "failure", reason: "timeout", atMs: mission.elapsedMs });
  }

  return { state: { ...state, tick: state.tick + 1, boat, mission }, events };
}
