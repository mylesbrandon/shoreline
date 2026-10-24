/**
 * Action validation and application. OWNER: Developer 1 (engine).
 *
 * Pure functions: never mutate `state`, never read the clock, never touch the network.
 * Seq-based dedupe of envelopes happens BEFORE this, in the host session (src/lib/game-client).
 */
import { RADIO, SONAR, WEATHER } from "../config";
import { ACTION_PERMISSIONS, GULL_CONTACT_ID } from "../types";
import type {
  ActionRejectReason,
  GameEvent,
  GameState,
  Marker,
  PlayerAction,
  Role,
  SectorId,
  SignalReading,
  SonarContact,
  Vec2,
} from "../types";
import { isSectorId, sectorCenter, sectorOf } from "../sectors";

export type SenderRole = Role | "host";

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  /** Non-null if the action was refused; `state` is then the unchanged input. */
  rejected: ActionRejectReason | null;
}

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
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

    case "SONAR_PING": {
      const { elapsedMs } = state.mission;
      const { lastPingAtMs } = state.sonar;
      // Same rule as SonarView.pingReadyAtMs, so the button and the engine agree.
      if (lastPingAtMs !== null && elapsedMs < lastPingAtMs + SONAR.pingCooldownMs) {
        return { state, events: [], rejected: "cooldown" };
      }
      const origin = { ...state.boat.position };
      // Any part of the hazard inside the sweep counts, matching the captain's lookout rule.
      const found = state.hazards.filter((h) => distance(h.position, origin) <= SONAR.pingRange + h.radius);
      const detected = found.map(
        (h): SonarContact => ({ hazardId: h.id, position: h.position, radius: h.radius, kind: h.kind, detectedAtMs: elapsedMs }),
      );
      // Playtest fix 12: the ping also catches the Gull when it's in range, so Sonar can talk the
      // Driver through the final approach. A snapshot: it goes stale as the Gull drifts. This
      // contact lives only in the Sonar view (the Captain view only shows contacts of real hazards).
      if (distance(state.target.position, origin) <= SONAR.pingRange) {
        detected.push({
          hazardId: GULL_CONTACT_ID,
          position: { ...state.target.position },
          radius: state.target.rescueRadius,
          kind: "gull",
          detectedAtMs: elapsedMs,
        });
      }
      const foundIds = new Set(detected.map((c) => c.hazardId));
      return {
        state: {
          ...state,
          hazards: state.hazards.map((h) => (foundIds.has(h.id) && !h.revealed ? { ...h, revealed: true } : h)),
          sonar: {
            lastPingAtMs: elapsedMs,
            lastPingOrigin: origin,
            // Re-detected hazards replace their old contact (no duplicates) so the scope's age fade restarts.
            contacts: [...state.sonar.contacts.filter((c) => !foundIds.has(c.hazardId)), ...detected],
            pingsUsed: state.sonar.pingsUsed + 1,
          },
        },
        events: [{ type: "SONAR_PINGED", origin, contactsFound: detected.length, atMs: elapsedMs }],
        rejected: null,
      };
    }

    // Shared markers everyone sees. Sonar keeps its last MARKERS.maxHazardMarks hazard marks;
    // radio has a single "we think they're here" guess that each new guess moves.
    case "MARK_HAZARD":
    case "MARK_TARGET": {
      const { elapsedMs } = state.mission;
      const marker: Marker = {
        id: nextMarkerId(state.markers),
        kind: action.type === "MARK_HAZARD" ? "hazard" : "target_guess",
        position: { x: action.position.x, y: action.position.y },
        placedBy: action.type === "MARK_HAZARD" ? "sonar" : "radio",
        placedAtMs: elapsedMs,
      };
      const kept =
        marker.kind === "target_guess"
          ? state.markers.filter((m) => m.kind !== "target_guess")
          : dropOldestHazardMarks(state.markers, MARKERS.maxHazardMarks - 1);
      return {
        state: { ...state, markers: [...kept, marker] },
        events: [{ type: "MARKER_PLACED", marker, atMs: elapsedMs }],
        rejected: null,
      };
    }

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

    // The reading carries only sector + strength; the target position never leaves the engine.
    case "RADIO_SCAN": {
      const { elapsedMs } = state.mission;
      const { lastScanAtMs } = state.radio;
      // Same rule as RadioView.scanReadyAtMs, so the button and the engine agree.
      if (lastScanAtMs !== null && elapsedMs < lastScanAtMs + RADIO.scanCooldownMs) {
        return { state, events: [], rejected: "cooldown" };
      }
      const reading: SignalReading = {
        sector: action.sector,
        strength: signalStrength(state.target.position, action.sector),
        atMs: elapsedMs,
      };
      return {
        state: {
          ...state,
          radio: {
            // One reading per sector (the latest), so rescanning updates the heat map instead of growing it.
            readings: [...state.radio.readings.filter((r) => r.sector !== action.sector), reading],
            lastScanAtMs: elapsedMs,
            scansUsed: state.radio.scansUsed + 1,
          },
        },
        events: [{ type: "RADIO_SCANNED", sector: reading.sector, strength: reading.strength, atMs: elapsedMs }],
        rejected: null,
      };
    }
  }
}

/** Engine-owned radio/marker tuning (not in config.ts: nothing outside the engine depends on it). */
export const SIGNAL = {
  /** Distance from the target at which a sector's signal fades to 0 (1.5 sectors: only neighbours register). */
  falloff: 1.5 / RADIO.grid,
} as const;

export const MARKERS = {
  /** Sonar hazard marks kept on the map; the oldest drops off first. */
  maxHazardMarks: 8,
} as const;

/**
 * Signal strength for a radio scan: 1 when the target is in the sector, otherwise fading linearly
 * with the distance from the target to the sector's center. A target outside a sector is at least
 * half a sector from its center, so only the target's own sector can read 1. Rounded to 2 decimals
 * because the UI shows bars, and full precision would let three readings triangulate the target.
 */
export function signalStrength(target: Vec2, sector: SectorId): number {
  if (sectorOf(target) === sector) return 1;
  const raw = 1 - distance(target, sectorCenter(sector)) / SIGNAL.falloff;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
}

/** Keep at most `keep` hazard marks (the newest), leaving other marker kinds untouched. */
function dropOldestHazardMarks(markers: Marker[], keep: number): Marker[] {
  const excess = markers.filter((m) => m.kind === "hazard").length - keep;
  if (excess <= 0) return markers;
  let dropped = 0;
  return markers.filter((m) => !(m.kind === "hazard" && dropped++ < excess));
}

/** Next marker id: one past the highest current `m<N>`, so ids increase and never clash on screen. */
function nextMarkerId(markers: Marker[]): string {
  return `m${markers.reduce((max, m) => Math.max(max, Number(m.id.slice(1)) || 0), 0) + 1}`;
}
