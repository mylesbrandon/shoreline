/**
 * Initial state creation. OWNER: Developer 1 (engine).
 */
import { BOAT, MISSION, TARGET, WEATHER } from "../config";
import type { GameState, Hazard } from "../types";

export interface CreateStateOptions {
  seed: number;
  /** Becomes GameState.gameId. The host passes a fresh id on every START/RESET. */
  gameId: string;
}

/**
 * Starter layout so the app runs end-to-end today.
 * TODO(dev1): generate hazards, target and current forecast deterministically from `seed`
 * (see ./rng.ts). Keep the target far from the boat start and leave at least one safe channel.
 */
const STARTER_HAZARDS: Hazard[] = [
  { id: "h1", kind: "reef", position: { x: 0.32, y: 0.7 }, radius: 0.045, revealed: false },
  { id: "h2", kind: "rock", position: { x: 0.62, y: 0.62 }, radius: 0.03, revealed: false },
  { id: "h3", kind: "reef", position: { x: 0.45, y: 0.45 }, radius: 0.05, revealed: false },
  { id: "h4", kind: "debris", position: { x: 0.75, y: 0.38 }, radius: 0.025, revealed: false },
  { id: "h5", kind: "reef", position: { x: 0.2, y: 0.3 }, radius: 0.04, revealed: false },
  { id: "h6", kind: "rock", position: { x: 0.55, y: 0.2 }, radius: 0.035, revealed: false },
];

export function createInitialState({ seed, gameId }: CreateStateOptions): GameState {
  return {
    gameId,
    tick: 0,
    seed,
    boat: {
      position: { x: MISSION.boatStart.x, y: MISSION.boatStart.y },
      heading: MISSION.boatStartHeading,
      speed: 0,
      throttle: 0,
      rudder: 0,
      hull: BOAT.startHull,
    },
    hazards: STARTER_HAZARDS.map((h) => ({ ...h, position: { ...h.position } })),
    weather: {
      windDirection: Math.PI * 0.75,
      windStrength: 0.5,
      current: { x: WEATHER.maxCurrent * 0.4, y: 0 },
      forecast: [],
      stormIntensity: 0.4,
      shieldActiveUntilMs: null,
      shieldReadyAtMs: 0,
    },
    target: { position: { x: 0.82, y: 0.12 }, rescueRadius: TARGET.rescueRadius },
    markers: [],
    sonar: { lastPingAtMs: null, lastPingOrigin: null, contacts: [], pingsUsed: 0 },
    radio: { readings: [], lastScanAtMs: null, scansUsed: 0 },
    mission: {
      phase: "briefing",
      elapsedMs: 0,
      durationMs: MISSION.durationMs,
      failureReason: null,
      score: null,
    },
    stats: { hazardsHit: 0, shieldsUsed: 0 },
  };
}
