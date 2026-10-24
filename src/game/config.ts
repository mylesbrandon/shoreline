/**
 * STORMLINE SHARED TUNING CONSTANTS
 * =================================
 * Shared contract (requires team agreement to change semantics; tweaking numbers during
 * playtesting is fine — just tell the team in chat).
 *
 * Units: map units (the ocean is [0,1] x [0,1]), radians, milliseconds, map units / second.
 */

export const MAP = {
  width: 1,
  height: 1,
  /** Boat is clamped this far from the edge. */
  edgePadding: 0.02,
} as const;

export const MISSION = {
  durationMs: 90_000,
  /** Boat start position and heading. */
  boatStart: { x: 0.5, y: 0.9 },
  boatStartHeading: 0,
} as const;

export const BOAT = {
  /** Map units / second at full throttle (crosses the map in ~29 s). */
  maxSpeed: 0.035,
  /** Map units / second^2 — how fast speed approaches throttle * maxSpeed. */
  acceleration: 0.025,
  /** Radians / second at full rudder and full speed. */
  maxTurnRate: 1.2,
  startHull: 100,
  /** Hull damage per hazard collision. */
  collisionDamage: 25,
  /** After a hit, the same hazard cannot damage again for this long. */
  collisionCooldownMs: 1_500,
} as const;

export const CAPTAIN = {
  /** Captain sees any hazard within this radius of the boat ("lookout range"). */
  visualRange: 0.07,
} as const;

export const SONAR = {
  pingCooldownMs: 3_000,
  /** Hazards within this distance of the boat at ping time become contacts. */
  pingRange: 0.3,
  /** Visual sweep duration for the UI. */
  sweepDurationMs: 1_200,
} as const;

export const WEATHER = {
  shieldDurationMs: 3_000,
  shieldCooldownMs: 10_000,
  /** While shielded, current is multiplied by this factor. */
  shieldCurrentFactor: 0.25,
  /** Max current strength, map units / second. */
  maxCurrent: 0.03,
  /** How far ahead the weather specialist can see in the forecast. */
  forecastHorizonMs: 8_000,
} as const;

export const RADIO = {
  scanCooldownMs: 3_500,
  /** Sector grid is GRID x GRID (see src/game/sectors.ts). */
  grid: 4,
} as const;

export const TARGET = {
  rescueRadius: 0.08,
} as const;

export const HAZARDS = {
  count: 22,
  minRadius: 0.025,
  maxRadius: 0.05,
} as const;

export const NETWORK = {
  /** Host simulation rate. Engine `step` is called with dtMs = 1000 / simHz. */
  simHz: 30,
  /** How often the host broadcasts the views bundle. Keep low for Supabase rate limits. */
  viewBroadcastHz: 10,
  /** Client-side rendering delay used for interpolation between snapshots. */
  interpolationDelayMs: 100,
  /** If no views arrive for this long, the client shows "Reconnecting…" and sends `hello`. */
  staleAfterMs: 3_000,
  /** Supabase client throttle (events per second per client). */
  eventsPerSecond: 20,
} as const;

export const ROOM = {
  codeLength: 4,
  maxPlayers: 4,
  /** Broadcast channel name prefix. Full name: `stormline:room:<CODE>`. */
  channelPrefix: "stormline:room:",
} as const;
