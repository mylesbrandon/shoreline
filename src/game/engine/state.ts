/**
 * Initial state creation. OWNER: Developer 1 (engine).
 */
import { BOAT, MISSION, TARGET } from "../config";
import type { GameState } from "../types";
import { generateLayout } from "./layout";

export interface CreateStateOptions {
  seed: number;
  /** Becomes GameState.gameId. The host passes a fresh id on every START/RESET. */
  gameId: string;
}

/** A fresh mission in briefing. Hazards, the Gull and the weather all come from `seed` (see ./layout.ts). */
export function createInitialState({ seed, gameId }: CreateStateOptions): GameState {
  const layout = generateLayout(seed);
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
    hazards: layout.hazards,
    weather: layout.weather,
    target: { position: layout.target, rescueRadius: TARGET.rescueRadius },
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
