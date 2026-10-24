/**
 * MOCK DATA — for building UI and tests before the engine and realtime layers exist.
 *
 * Everything here is hand-written sample data that compiles against src/game/types.ts.
 * It is NOT produced by the engine and NOT synchronized across devices. Anything rendered
 * from it must be labeled "MOCK" in the UI (see components/shared/ModeBadge).
 *
 * Shared file: anyone may ADD mock fixtures; don't change existing ones without telling the team
 * (other people's components and tests rely on them).
 */
import { BOAT, MISSION, SONAR, TARGET, WEATHER } from "./config";
import type {
  BoatState,
  CaptainView,
  GameState,
  Hazard,
  Marker,
  MissionState,
  RadioView,
  Room,
  RoleViews,
  SonarView,
  SpectatorView,
  WeatherView,
} from "./types";

export const MOCK_ROOM_CODE = "DEMO";

export const MOCK_ROOM: Room = {
  code: MOCK_ROOM_CODE,
  hostId: "host-demo",
  status: "lobby",
  createdAt: 1_761_300_000_000,
  players: [
    { id: "p-ana", name: "Ana", role: "captain", connected: true, joinedAt: 1_761_300_001_000 },
    { id: "p-ben", name: "Ben", role: "sonar", connected: true, joinedAt: 1_761_300_002_000 },
    { id: "p-cam", name: "Cam", role: "weather", connected: true, joinedAt: 1_761_300_003_000 },
    { id: "p-dee", name: "Dee", role: "radio", connected: false, joinedAt: 1_761_300_004_000 },
  ],
};

export const MOCK_HAZARDS: Hazard[] = [
  { id: "h1", kind: "reef", position: { x: 0.32, y: 0.7 }, radius: 0.045, revealed: true, lastHitAtMs: null },
  { id: "h2", kind: "rock", position: { x: 0.62, y: 0.62 }, radius: 0.03, revealed: true, lastHitAtMs: null },
  { id: "h3", kind: "reef", position: { x: 0.45, y: 0.45 }, radius: 0.05, revealed: false, lastHitAtMs: null },
  { id: "h4", kind: "debris", position: { x: 0.75, y: 0.38 }, radius: 0.025, revealed: false, lastHitAtMs: null },
  { id: "h5", kind: "reef", position: { x: 0.2, y: 0.3 }, radius: 0.04, revealed: false, lastHitAtMs: null },
  { id: "h6", kind: "rock", position: { x: 0.55, y: 0.2 }, radius: 0.035, revealed: false, lastHitAtMs: null },
];

export const MOCK_BOAT: BoatState = {
  position: { x: 0.5, y: 0.78 },
  heading: Math.PI / 12,
  speed: 0.03,
  throttle: 0.5,
  rudder: 0.2,
  hull: 75,
};

export const MOCK_MISSION: MissionState = {
  phase: "active",
  elapsedMs: 32_000,
  durationMs: MISSION.durationMs,
  failureReason: null,
  score: null,
};

export const MOCK_MARKERS: Marker[] = [
  { id: "m1", kind: "hazard", position: { x: 0.45, y: 0.45 }, placedBy: "sonar", placedAtMs: 28_000 },
  { id: "m2", kind: "target_guess", position: { x: 0.8, y: 0.15 }, placedBy: "radio", placedAtMs: 30_500 },
];

export const MOCK_GAME_STATE: GameState = {
  gameId: "mock-game-1",
  tick: 960,
  seed: 42,
  boat: MOCK_BOAT,
  hazards: MOCK_HAZARDS,
  weather: {
    windDirection: Math.PI * 0.75,
    windStrength: 0.6,
    current: { x: 0.004, y: -0.002 },
    // Gust pairs, like the engine sends: a gust, then back to the calm base 3 s later.
    forecast: [
      { atMs: 34_000, current: { x: 0.022, y: -0.002 } },
      { atMs: 37_000, current: { x: 0.004, y: -0.002 } },
      { atMs: 43_000, current: { x: -0.006, y: 0.026 } },
      { atMs: 46_000, current: { x: 0.004, y: -0.002 } },
    ],
    stormIntensity: 0.55,
    shieldActiveUntilMs: null,
    shieldReadyAtMs: 0,
  },
  target: { position: { x: 0.82, y: 0.12 }, rescueRadius: TARGET.rescueRadius },
  markers: MOCK_MARKERS,
  sonar: {
    lastPingAtMs: 29_000,
    lastPingOrigin: { x: 0.5, y: 0.8 },
    contacts: [
      { hazardId: "h1", position: { x: 0.32, y: 0.7 }, radius: 0.045, kind: "reef", detectedAtMs: 29_000 },
      { hazardId: "h2", position: { x: 0.62, y: 0.62 }, radius: 0.03, kind: "rock", detectedAtMs: 29_000 },
      { hazardId: "h3", position: { x: 0.45, y: 0.45 }, radius: 0.05, kind: "reef", detectedAtMs: 29_000 },
    ],
    pingsUsed: 3,
  },
  radio: {
    readings: [
      { sector: "D1", strength: 0.92, atMs: 30_000 },
      { sector: "C2", strength: 0.55, atMs: 26_000 },
      { sector: "A3", strength: 0.1, atMs: 20_000 },
    ],
    lastScanAtMs: 30_000,
    scansUsed: 3,
  },
  mission: MOCK_MISSION,
  stats: { hazardsHit: 1, shieldsUsed: 0 },
};

const base = {
  gameId: MOCK_GAME_STATE.gameId,
  tick: MOCK_GAME_STATE.tick,
  boat: MOCK_BOAT,
  mission: MOCK_MISSION,
  markers: MOCK_MARKERS,
};

export const MOCK_CAPTAIN_VIEW: CaptainView = {
  ...base,
  role: "captain",
  visibleHazards: MOCK_HAZARDS.filter((h) => h.revealed),
  current: MOCK_GAME_STATE.weather.current,
  stormIntensity: MOCK_GAME_STATE.weather.stormIntensity,
  shieldActive: false,
};

export const MOCK_SONAR_VIEW: SonarView = {
  ...base,
  role: "sonar",
  contacts: MOCK_GAME_STATE.sonar.contacts,
  lastPingAtMs: MOCK_GAME_STATE.sonar.lastPingAtMs,
  lastPingOrigin: MOCK_GAME_STATE.sonar.lastPingOrigin,
  pingReadyAtMs: 29_000 + SONAR.pingCooldownMs,
};

export const MOCK_WEATHER_VIEW: WeatherView = {
  ...base,
  role: "weather",
  weather: MOCK_GAME_STATE.weather,
};

export const MOCK_RADIO_VIEW: RadioView = {
  ...base,
  role: "radio",
  readings: MOCK_GAME_STATE.radio.readings,
  lastScanAtMs: MOCK_GAME_STATE.radio.lastScanAtMs,
  scanReadyAtMs: 30_000 + 2_500,
  distressLog: [
    "…mayday, mayday, this is the Gull…",
    "…engine flooded, drifting north-east…",
    "…can see a lighthouse to our south…",
  ],
};

export const MOCK_ROLE_VIEWS: RoleViews = {
  captain: MOCK_CAPTAIN_VIEW,
  sonar: MOCK_SONAR_VIEW,
  weather: MOCK_WEATHER_VIEW,
  radio: MOCK_RADIO_VIEW,
};

export const MOCK_SPECTATOR_VIEW: SpectatorView = {
  ...base,
  role: "spectator",
  hazards: MOCK_HAZARDS.filter((h) => h.revealed),
  target: null,
  weather: MOCK_GAME_STATE.weather,
};

/**
 * SCRIPTED MOTION (not simulation): a boat that loops a figure-eight so UI developers can
 * test rendering and interpolation without the engine. Pure function of time.
 */
export function scriptedBoatAt(tMs: number): BoatState {
  const t = (tMs / 1000) * 0.35;
  const x = 0.5 + 0.28 * Math.sin(t);
  const y = 0.55 + 0.22 * Math.sin(2 * t);
  const dx = 0.28 * Math.cos(t);
  const dy = 0.44 * Math.cos(2 * t);
  // heading: 0 = north (-y), clockwise positive
  const heading = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  return {
    position: { x, y },
    heading,
    speed: BOAT.maxSpeed * 0.6,
    throttle: 0.6,
    rudder: Math.max(-1, Math.min(1, Math.cos(t) * 0.8)),
    hull: BOAT.startHull,
  };
}

/** Mock views with the scripted boat and a ticking clock, for live-looking UI previews. */
export function mockRoleViewsAt(tMs: number): RoleViews {
  const boat = scriptedBoatAt(tMs);
  const elapsedMs = Math.min(MISSION.durationMs, tMs % MISSION.durationMs);
  const mission: MissionState = { ...MOCK_MISSION, elapsedMs };
  const tick = Math.floor(tMs / (1000 / 30));
  const patch = { boat, mission, tick };
  return {
    captain: { ...MOCK_CAPTAIN_VIEW, ...patch },
    sonar: { ...MOCK_SONAR_VIEW, ...patch },
    weather: {
      ...MOCK_WEATHER_VIEW,
      ...patch,
      weather: { ...MOCK_WEATHER_VIEW.weather, shieldReadyAtMs: WEATHER.shieldCooldownMs },
    },
    radio: { ...MOCK_RADIO_VIEW, ...patch },
  };
}

export function mockSpectatorViewAt(tMs: number): SpectatorView {
  const views = mockRoleViewsAt(tMs);
  return { ...MOCK_SPECTATOR_VIEW, boat: views.captain.boat, mission: views.captain.mission, tick: views.captain.tick };
}
