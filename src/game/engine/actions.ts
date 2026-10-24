/**
 * Action validation and application. OWNER: Developer 1 (engine).
 *
 * Pure functions: never mutate `state`, never read the clock, never touch the network.
 * Seq-based dedupe of envelopes happens BEFORE this, in the host session (src/lib/game-client).
 */
import { WEATHER } from "../config";
import { ACTION_PERMISSIONS } from "../types";
import type { ActionRejectReason, GameEvent, GameState, PlayerAction, Role } from "../types";
import { isSectorId } from "../sectors";

export type SenderRole = Role | "host";

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  /** Non-null if the action was refused; `state` is then the unchanged input. */
  rejected: ActionRejectReason | null;
}

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const inUnitSquare = (p: { x: number; y: number }) =>
  isFiniteNumber(p.x) && isFiniteNumber(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Structural/permission/phase checks. Cooldowns are checked in applyAction. */
export function validateAction(
  state: GameState,
  action: PlayerAction,
  sender: SenderRole | null,
): ActionRejectReason | null {
  if (sender === null) return "unknown_player";
  if (!ACTION_PERMISSIONS[action.type].includes(sender)) return "not_permitted";

  const phase = state.mission.phase;
  if (action.type === "START_GAME") return phase === "active" ? "wrong_phase" : null;
  if (action.type === "RESET_GAME") return null;
  if (phase !== "active") return "wrong_phase";

  switch (action.type) {
    case "STEER":
      return isFiniteNumber(action.rudder) && Math.abs(action.rudder) <= 1 ? null : "invalid_payload";
    case "SET_THROTTLE":
      return isFiniteNumber(action.throttle) && action.throttle >= 0 && action.throttle <= 1
        ? null
        : "invalid_payload";
    case "MARK_HAZARD":
    case "MARK_TARGET":
      return action.position && inUnitSquare(action.position) ? null : "invalid_payload";
    case "RADIO_SCAN":
      return isSectorId(action.sector) ? null : "invalid_payload";
    case "SONAR_PING":
    case "WEATHER_SHIELD":
      return null;
  }
}

export function applyAction(state: GameState, action: PlayerAction, sender: SenderRole | null): ActionResult {
  const rejected = validateAction(state, action, sender);
  if (rejected) return { state, events: [], rejected };

  switch (action.type) {
    case "START_GAME":
      return {
        state: {
          ...state,
          tick: 0,
          mission: { ...state.mission, phase: "active", elapsedMs: 0, failureReason: null, score: null },
        },
        events: [{ type: "MISSION_STARTED", atMs: 0 }],
        rejected: null,
      };

    case "RESET_GAME":
      // The host session creates a fresh state via createInitialState() with a new gameId/seed;
      // here we only return to briefing so a bare engine call is still meaningful.
      return {
        state: { ...state, mission: { ...state.mission, phase: "briefing", elapsedMs: 0, failureReason: null, score: null } },
        events: [],
        rejected: null,
      };

    // Continuous "set" controls: stored on the boat, applied by step().
    case "STEER":
      return { state: { ...state, boat: { ...state.boat, rudder: action.rudder } }, events: [], rejected: null };

    case "SET_THROTTLE":
      return { state: { ...state, boat: { ...state.boat, throttle: action.throttle } }, events: [], rejected: null };

    // TODO(dev1, later): cooldown check → reveal hazards within SONAR.pingRange, record contacts,
    // emit SONAR_PINGED. Return rejected: "cooldown" if pinged too recently.
    case "SONAR_PING":
      return { state, events: [], rejected: null };

    // TODO(dev1, later): append a shared Marker (cap the list, e.g. last 8), emit MARKER_PLACED.
    case "MARK_HAZARD":
    case "MARK_TARGET":
      return { state, events: [], rejected: null };

    // step() dampens the current while elapsedMs < shieldActiveUntilMs.
    case "WEATHER_SHIELD": {
      const { elapsedMs } = state.mission;
      if (elapsedMs < state.weather.shieldReadyAtMs) return { state, events: [], rejected: "cooldown" };
      const untilMs = elapsedMs + WEATHER.shieldDurationMs;
      return {
        state: {
          ...state,
          weather: {
            ...state.weather,
            shieldActiveUntilMs: untilMs,
            shieldReadyAtMs: elapsedMs + WEATHER.shieldCooldownMs,
          },
          stats: { ...state.stats, shieldsUsed: state.stats.shieldsUsed + 1 },
        },
        events: [{ type: "SHIELD_ACTIVATED", untilMs, atMs: elapsedMs }],
        rejected: null,
      };
    }

    // TODO(dev1, later): cooldown check → strength from distance(target, sectorCenter) → append
    // SignalReading, emit RADIO_SCANNED. Never put the target position itself in the reading.
    case "RADIO_SCAN":
      return { state, events: [], rejected: null };
  }
}
