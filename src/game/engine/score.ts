/**
 * Mission scoring. OWNER: Developer 1 (engine).
 * types.ts leaves MissionScore.total's formula to the engine, so its tuning lives here, not in config.ts.
 */
import type { GameState, MissionScore } from "../types";

export const SCORE = {
  /** Flat bonus for reaching the Gull. A failed mission scores 0. */
  rescueBonus: 1_000,
  perSecondRemaining: 10,
  perHullPoint: 5,
} as const;

/**
 * Score a finished mission from its final state. Tool use (pings, scans, shields) is reported but
 * never penalized: it's a co-op game and we want players to talk and use their stations.
 */
export function scoreMission(state: GameState, phase: "victory" | "failure"): MissionScore {
  const timeRemainingMs = Math.max(0, state.mission.durationMs - state.mission.elapsedMs);
  const hullRemaining = state.boat.hull;
  const total =
    phase === "victory"
      ? Math.round(
          SCORE.rescueBonus + (timeRemainingMs / 1000) * SCORE.perSecondRemaining + hullRemaining * SCORE.perHullPoint,
        )
      : 0;
  return {
    timeRemainingMs,
    hullRemaining,
    hazardsHit: state.stats.hazardsHit,
    pingsUsed: state.sonar.pingsUsed,
    scansUsed: state.radio.scansUsed,
    shieldsUsed: state.stats.shieldsUsed,
    total,
  };
}
