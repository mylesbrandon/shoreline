/**
 * Fixed-timestep simulation. OWNER: Developer 1 (engine).
 *
 * The host calls step(state, 1000 / NETWORK.simHz) ~30 times per second.
 * Pure: same input => same output. No Date.now(), no Math.random().
 */
import type { GameEvent, GameState } from "../types";

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export function step(state: GameState, dtMs: number): StepResult {
  if (state.mission.phase !== "active") return { state, events: [] };

  const events: GameEvent[] = [];
  const elapsedMs = state.mission.elapsedMs + dtMs;

  // TODO(dev1, FIRST TASK): boat physics —
  //   1. ease speed toward throttle * BOAT.maxSpeed (BOAT.acceleration)
  //   2. heading += rudder * BOAT.maxTurnRate * (speed / maxSpeed) * dt
  //   3. position += heading vector * speed * dt (+ weather.current, shield-scaled, later)
  //   4. clamp to [MAP.edgePadding, 1 - MAP.edgePadding]
  // TODO(dev1, later): hazard collisions, current forecast shifts, rescue check, score.

  let mission = { ...state.mission, elapsedMs };
  if (elapsedMs >= state.mission.durationMs) {
    mission = { ...mission, elapsedMs: state.mission.durationMs, phase: "failure", failureReason: "timeout" };
    events.push({ type: "MISSION_ENDED", phase: "failure", reason: "timeout", atMs: mission.elapsedMs });
  }

  return { state: { ...state, tick: state.tick + 1, mission }, events };
}
