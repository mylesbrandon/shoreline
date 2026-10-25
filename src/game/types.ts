/**
 * SHORELINE SHARED CONTRACTS
 * ==========================
 * Every module (engine, realtime, captain UI, specialist UI) depends on these types.
 * Changing this file requires agreement from all four developers — see docs/CONTRACTS.md.
 *
 * Conventions (also documented in docs/CONTRACTS.md):
 * - Coordinates are NORMALIZED map units: the ocean is the square [0,1] x [0,1].
 *   Origin (0,0) is the top-left (north-west) corner. +x is east, +y is SOUTH (screen convention).
 * - Heading is in RADIANS. 0 = north (towards -y), increasing CLOCKWISE (PI/2 = east).
 * - Speed / current velocity are in map units per SECOND.
 * - All durations and timestamps inside game state are MILLISECONDS of mission time
 *   (`MissionState.elapsedMs`), never wall-clock time. Network envelopes use wall-clock `Date.now()`.
 * - Plain JSON-serializable data only (no classes, Maps, Dates, functions) so state can be
 *   broadcast over Supabase Realtime and snapshotted.
 */
import type { MatchEvent, MatchScoreboard, VersusRoom, VersusViews } from "./versus/contract";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Role = "captain" | "sonar" | "weather" | "radio";

export const ROLES: readonly Role[] = ["captain", "sonar", "weather", "radio"] as const;

/** Stable per-device id, persisted in localStorage per room so reconnects keep their role. */
export type PlayerId = string;

/** Normalized map position or direction vector. See coordinate conventions above. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Radio sector id on a 4x4 grid: columns A–D (west→east), rows 1–4 (north→south). e.g. "B3". */
export type SectorId = `${"A" | "B" | "C" | "D"}${1 | 2 | 3 | 4}`;

// ---------------------------------------------------------------------------
// Lobby / room
// ---------------------------------------------------------------------------

export interface Player {
  id: PlayerId;
  name: string;
  role: Role | null;
  connected: boolean;
  /** Wall-clock ms when first seen by the host. */
  joinedAt: number;
}

export type RoomStatus = "lobby" | "playing" | "ended";

export interface Room {
  /** 4-letter uppercase code, e.g. "WAVE". */
  code: string;
  /** The host is the laptop/spectator browser. It is NOT one of the four players. */
  hostId: PlayerId;
  players: Player[];
  status: RoomStatus;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// World state (HOST ONLY — never broadcast as a whole; see RoleViewState)
// ---------------------------------------------------------------------------

export interface BoatState {
  position: Vec2;
  /** Radians, 0 = north, clockwise positive. Engine keeps it in [0, 2*PI). */
  heading: number;
  /** Current speed through the water, map units / second (>= 0). */
  speed: number;
  /** Captain's throttle setting, 0 (stop) .. 1 (full ahead). */
  throttle: number;
  /** Captain's rudder setting, -1 (hard port/left) .. 1 (hard starboard/right). */
  rudder: number;
  /** Hull integrity 0..100. Reaching 0 fails the mission. */
  hull: number;
}

export type HazardKind = "reef" | "rock" | "debris";

export interface Hazard {
  id: string;
  kind: HazardKind;
  position: Vec2;
  /** Collision radius in map units. */
  radius: number;
  /** True once detected by a sonar ping (or seen by the captain up close). */
  revealed: boolean;
  /** Mission time (ms) of this hazard's last hull hit, or null if never hit. Drives BOAT.collisionCooldownMs. */
  lastHitAtMs: number | null;
}

export interface CurrentForecastEntry {
  /** Mission time (ms) at which this current takes effect. */
  atMs: number;
  /** Current velocity vector in map units / second. */
  current: Vec2;
}

export interface WeatherState {
  /** Wind direction in radians (same convention as heading: direction the wind blows TOWARDS). */
  windDirection: number;
  /** 0..1 */
  windStrength: number;
  /** Ocean current applied to the boat, map units / second. */
  current: Vec2;
  /** Upcoming current changes, sorted by atMs. Only the weather specialist sees these. */
  forecast: CurrentForecastEntry[];
  /** 0..1, purely visual/ambience plus scales current strength. */
  stormIntensity: number;
  /** Mission time (ms) when the weather shield expires, or null if inactive. */
  shieldActiveUntilMs: number | null;
  /** Mission time (ms) when the shield can be used again. 0 = ready. */
  shieldReadyAtMs: number;
}

export interface RescueTarget {
  /** HIDDEN: never sent to any player view until the mission ends. */
  position: Vec2;
  /** Boat must come within this distance to complete the rescue. */
  rescueRadius: number;
}

export type MarkerKind = "hazard" | "target_guess" | "waypoint";

export interface Marker {
  id: string;
  kind: MarkerKind;
  position: Vec2;
  placedBy: Role;
  placedAtMs: number;
}

/**
 * What a sonar ping found. Usually a hazard; "gull" means the ping also caught the Gull itself
 * (within SONAR.pingRange). Gull contacts exist ONLY in the Sonar view, never the Captain's.
 */
export type SonarContactKind = HazardKind | "gull";

/** hazardId used by the Gull's sonar contact. */
export const GULL_CONTACT_ID = "gull";

export interface SonarContact {
  /** The hazard's id, or GULL_CONTACT_ID for the Gull. */
  hazardId: string;
  position: Vec2;
  radius: number;
  kind: SonarContactKind;
  detectedAtMs: number;
}

export interface SonarState {
  /** Mission time of the last ping, or null if never pinged. */
  lastPingAtMs: number | null;
  /** Boat position at the moment of the last ping (sonar sweep origin). */
  lastPingOrigin: Vec2 | null;
  /** Contacts detected by pings so far. */
  contacts: SonarContact[];
  pingsUsed: number;
}

export interface SignalReading {
  sector: SectorId;
  /** 0 (nothing) .. 1 (target is in this sector). Derived from distance to the hidden target. */
  strength: number;
  atMs: number;
}

export interface RadioState {
  readings: SignalReading[];
  lastScanAtMs: number | null;
  scansUsed: number;
}

export type MissionPhase = "briefing" | "active" | "victory" | "failure";

export type FailureReason = "timeout" | "hull_destroyed";

export interface MissionScore {
  timeRemainingMs: number;
  hullRemaining: number;
  hazardsHit: number;
  pingsUsed: number;
  scansUsed: number;
  shieldsUsed: number;
  /** Single headline number for the results screen. Formula owned by the engine. */
  total: number;
}

export interface MissionState {
  phase: MissionPhase;
  /** Mission time elapsed since phase became "active". */
  elapsedMs: number;
  durationMs: number;
  failureReason: FailureReason | null;
  /** Set when phase is "victory" or "failure". */
  score: MissionScore | null;
}

/**
 * The authoritative world. Lives ONLY in the host browser and is mutated ONLY by the engine
 * (src/game/engine). Never broadcast whole: hidden information (target, unrevealed hazards,
 * forecast) is filtered per role by `getRoleView`.
 */
export interface GameState {
  /** Changes on every START_GAME / RESET_GAME so clients can discard stale views. */
  gameId: string;
  /** Incremented by the engine on every simulation step. Used to order views. */
  tick: number;
  /** Seed for deterministic hazard/target/current generation. */
  seed: number;
  boat: BoatState;
  hazards: Hazard[];
  weather: WeatherState;
  target: RescueTarget;
  markers: Marker[];
  sonar: SonarState;
  radio: RadioState;
  mission: MissionState;
  stats: {
    hazardsHit: number;
    shieldsUsed: number;
  };
}

// ---------------------------------------------------------------------------
// Role views (what each player device receives and renders)
// ---------------------------------------------------------------------------

interface BaseRoleView {
  gameId: string;
  tick: number;
  /** Everyone sees the boat and mission clock — the shared reality that makes callouts work. */
  boat: BoatState;
  mission: MissionState;
  /** Shared markers (hazard marks from sonar, target guesses from radio). */
  markers: Marker[];
}

export interface CaptainView extends BaseRoleView {
  role: "captain";
  /** Revealed hazards + any hazard within CAPTAIN.visualRange of the boat. */
  visibleHazards: Hazard[];
  /** Current only as a coarse arrow (the weather specialist has precise numbers + forecast). */
  current: Vec2;
  stormIntensity: number;
  shieldActive: boolean;
}

export interface SonarView extends BaseRoleView {
  role: "sonar";
  contacts: SonarContact[];
  lastPingAtMs: number | null;
  lastPingOrigin: Vec2 | null;
  /** Mission time when the next ping is allowed. */
  pingReadyAtMs: number;
}

export interface WeatherView extends BaseRoleView {
  role: "weather";
  weather: WeatherState;
}

export interface RadioView extends BaseRoleView {
  role: "radio";
  readings: SignalReading[];
  lastScanAtMs: number | null;
  scanReadyAtMs: number;
  /** Narrative flavor lines from the stranded vessel (e.g. "Taking on water!"). */
  distressLog: string[];
}

export type RoleViewState = CaptainView | SonarView | WeatherView | RadioView;

/** Map from role → that role's view. Selecting the right one is a type-safe lookup. */
export type RoleViews = {
  captain: CaptainView;
  sonar: SonarView;
  weather: WeatherView;
  radio: RadioView;
};

/**
 * Spectator / host laptop view. Shows the action for the audience but keeps the target hidden
 * until the mission ends (so judges watching the big screen can't shout the answer).
 */
export interface SpectatorView extends BaseRoleView {
  role: "spectator";
  hazards: Hazard[];
  target: RescueTarget | null;
  weather: WeatherState;
}

// ---------------------------------------------------------------------------
// Player actions (discriminated union on `type`)
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { type: "STEER"; rudder: number } // captain, -1..1 (continuous "set" — latest wins)
  | { type: "SET_THROTTLE"; throttle: number } // captain, 0..1 (continuous "set" — latest wins)
  | { type: "SONAR_PING" } // sonar, sweep from current boat position, cooldown-limited
  | { type: "MARK_HAZARD"; position: Vec2 } // sonar, shared marker for the captain
  | { type: "WEATHER_SHIELD" } // weather, temporarily dampens current, cooldown-limited
  | { type: "RADIO_SCAN"; sector: SectorId } // radio, returns signal strength for a sector
  | { type: "MARK_TARGET"; position: Vec2 } // radio, shared "we think they're here" marker
  | { type: "START_GAME" } // host only
  | { type: "RESET_GAME" }; // host only

export type PlayerActionType = PlayerAction["type"];

/** Who may send each action. "host" = the host browser itself (not a player role). */
export const ACTION_PERMISSIONS: Record<PlayerActionType, readonly (Role | "host")[]> = {
  STEER: ["captain"],
  SET_THROTTLE: ["captain"],
  SONAR_PING: ["sonar"],
  MARK_HAZARD: ["sonar"],
  WEATHER_SHIELD: ["weather"],
  RADIO_SCAN: ["radio"],
  MARK_TARGET: ["radio"],
  START_GAME: ["host"],
  RESET_GAME: ["host"],
};

/** Wraps every action sent over the network. */
export interface ActionEnvelope {
  /** Unique id (`${playerId}:${seq}`) — used for dedupe and debugging. */
  actionId: string;
  playerId: PlayerId;
  /** Monotonically increasing per player session. Host drops seq <= last seen seq. */
  seq: number;
  /** Wall-clock ms on the sender. Informational only; never trusted for game timing. */
  sentAt: number;
  action: PlayerAction;
}

export type ActionRejectReason =
  | "not_permitted" // role may not send this action
  | "unknown_player"
  | "wrong_phase" // e.g. STEER while in "briefing"
  | "cooldown" // e.g. SONAR_PING too soon
  | "invalid_payload" // NaN, out-of-range, bad sector
  | "duplicate"; // seq already processed

// ---------------------------------------------------------------------------
// Game events (one-shot things clients may animate/sound; derived by the engine)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "MISSION_STARTED"; atMs: number }
  | { type: "HAZARD_HIT"; hazardId: string; damage: number; atMs: number }
  | { type: "SONAR_PINGED"; origin: Vec2; contactsFound: number; atMs: number }
  | { type: "SHIELD_ACTIVATED"; untilMs: number; atMs: number }
  | { type: "RADIO_SCANNED"; sector: SectorId; strength: number; atMs: number }
  | { type: "CURRENT_SHIFTED"; current: Vec2; atMs: number }
  | { type: "MARKER_PLACED"; marker: Marker; atMs: number }
  | { type: "MISSION_ENDED"; phase: "victory" | "failure"; reason: FailureReason | null; atMs: number };

// ---------------------------------------------------------------------------
// Network messages (Supabase Realtime Broadcast payloads)
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = 1 as const;

interface MessageBase {
  v: typeof PROTOCOL_VERSION;
  /** Unique message id, used for dedupe. */
  msgId: string;
  /** Sender id: a PlayerId or the host id. */
  from: PlayerId;
  /** Wall-clock ms on the sender. */
  sentAt: number;
}

/**
 * Every message on the room channel. Broadcast event name is always "msg"; route on `type`.
 * Direction is noted per variant. See docs/CONTRACTS.md for the full protocol.
 */
export type NetworkMessage =
  // player → host
  | (MessageBase & { type: "action"; envelope: ActionEnvelope })
  // player → host: "I (re)joined, please send me everything" (reconnect / late join)
  | (MessageBase & { type: "hello"; playerId: PlayerId; name: string })
  // host → all: authoritative lobby/room state (sent on any change and in reply to hello)
  | (MessageBase & { type: "room"; room: Room })
  // host → all: role views bundle at NETWORK.viewBroadcastHz. Each client renders only its role.
  | (MessageBase & { type: "views"; gameId: string; tick: number; views: Partial<RoleViews> })
  // host → all: one-shot events for effects (shake, sound, toast)
  | (MessageBase & { type: "events"; gameId: string; tick: number; events: GameEvent[] })
  // host → one player: action was rejected (optional UX feedback)
  | (MessageBase & { type: "action_rejected"; actionId: string; reason: ActionRejectReason })
  // anyone → anyone: connectivity smoke test (Developer 2's first task)
  | (MessageBase & { type: "test"; text: string })
  // 2v2 "Rescue Showdown" (additive, see src/game/versus/contract.ts). Phones still send
  // "hello" and "action"; a versus host answers with these instead of room/views/events.
  // host → all: versus lobby (team seats)
  | (MessageBase & { type: "versus_room"; room: VersusRoom })
  // host → all at NETWORK.viewBroadcastHz: public scoreboard + every seat's view
  | (MessageBase & { type: "versus_views"; matchId: string; tick: number; scoreboard: MatchScoreboard; views: VersusViews })
  // host → all: one-shot effects, tagged by team where relevant
  | (MessageBase & { type: "versus_events"; matchId: string; tick: number; events: MatchEvent[] });

export type NetworkMessageType = NetworkMessage["type"];

/** Presence payload each device tracks on the room channel. */
export interface PresenceMeta {
  playerId: PlayerId;
  name: string;
  kind: "host" | "player";
  onlineAt: number;
}
