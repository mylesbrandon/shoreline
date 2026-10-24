/**
 * Hidden-information filtering: GameState (host only) → per-role views (sent to devices).
 * OWNER: Developer 1 (engine). This is the ONLY place that decides who sees what.
 *
 * Rules (see docs/CONTRACTS.md "Hidden information"):
 * - Nobody but the engine sees `target` until the mission ends (spectator gets it at the end).
 * - The captain sees hazards within CAPTAIN.visualRange, plus sonar contacts for a few seconds.
 * - Only the weather specialist gets the forecast and exact current numbers.
 */
import { CAPTAIN, RADIO, SONAR, WEATHER } from "../config";
import type { CaptainView, GameState, RadioView, Role, RoleViews, SonarView, SpectatorView, WeatherView } from "../types";
import { gullDriftVelocity, isShieldActive } from "./step";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function base(state: GameState) {
  return {
    gameId: state.gameId,
    tick: state.tick,
    boat: state.boat,
    mission: state.mission,
    markers: state.markers,
  };
}

/** Engine-owned view tuning (not in config.ts: nothing outside the engine depends on it). */
export const CAPTAIN_VIEW = {
  /** A sonar contact shows on the Captain's screen for this long, then only Sonar's marks remain. */
  sonarRevealMs: 5_000,
} as const;

/**
 * The Captain sees hazards in lookout range plus Sonar contacts from the last few seconds.
 * Reveals expire on purpose (playtest: persistent reveals let the Captain build a hazard map and
 * stop listening to Sonar). `Hazard.revealed` stays set for the spectator.
 */
export function getCaptainView(state: GameState): CaptainView {
  const shieldActive = isShieldActive(state.weather, state.mission.elapsedMs);
  const freshContacts = new Set(
    state.sonar.contacts
      .filter((c) => state.mission.elapsedMs - c.detectedAtMs < CAPTAIN_VIEW.sonarRevealMs)
      .map((c) => c.hazardId),
  );
  return {
    ...base(state),
    role: "captain",
    visibleHazards: state.hazards.filter(
      (h) => freshContacts.has(h.id) || dist(h.position, state.boat.position) <= CAPTAIN.visualRange + h.radius,
    ),
    current: state.weather.current,
    stormIntensity: state.weather.stormIntensity,
    shieldActive,
  };
}

export function getSonarView(state: GameState): SonarView {
  return {
    ...base(state),
    role: "sonar",
    contacts: state.sonar.contacts,
    lastPingAtMs: state.sonar.lastPingAtMs,
    lastPingOrigin: state.sonar.lastPingOrigin,
    pingReadyAtMs: state.sonar.lastPingAtMs === null ? 0 : state.sonar.lastPingAtMs + SONAR.pingCooldownMs,
  };
}

/** The weather specialist sees only the next WEATHER.forecastHorizonMs of the forecast. */
export function getWeatherView(state: GameState): WeatherView {
  const horizonMs = state.mission.elapsedMs + WEATHER.forecastHorizonMs;
  const forecast = state.weather.forecast.filter((entry) => entry.atMs <= horizonMs);
  return { ...base(state), role: "weather", weather: { ...state.weather, forecast } };
}

export function getRadioView(state: GameState): RadioView {
  return {
    ...base(state),
    role: "radio",
    readings: state.radio.readings,
    lastScanAtMs: state.radio.lastScanAtMs,
    scanReadyAtMs: state.radio.lastScanAtMs === null ? 0 : state.radio.lastScanAtMs + RADIO.scanCooldownMs,
    distressLog: towerRadioLines(state),
  };
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

/** 8-point compass name for a direction vector (+y is south, like the map). */
function compass(v: { x: number; y: number }): string {
  const angle = Math.atan2(v.x, -v.y); // 0 = north, clockwise, like heading
  const index = Math.round(angle / (Math.PI / 4));
  return COMPASS[((index % 8) + 8) % 8] ?? "north";
}

/**
 * Tower Radio chatter: beachgoers calling in sightings, newest last. Built only from things that
 * aren't secret: the drift direction comes from the current (Weather sees it exactly) plus the
 * rip, and the urgency lines from the mission clock. Never coordinates or sectors: finding the
 * Gull is still Radio's job.
 */
function towerRadioLines(state: GameState): string[] {
  const lines = ["Tower 4, a tourist on a giant seagull float just drifted past the buoys!"];
  lines.push(`Beachgoers say the seagull is drifting ${compass(gullDriftVelocity(state.weather.current))}.`);
  if (state.mission.elapsedMs >= 30_000) lines.push("Pier report: they're getting tired out there.");
  if (state.mission.elapsedMs >= 60_000) lines.push("The rip is pulling them out fast. Hurry!");
  return lines;
}

export function getRoleViews(state: GameState): RoleViews {
  return {
    captain: getCaptainView(state),
    sonar: getSonarView(state),
    weather: getWeatherView(state),
    radio: getRadioView(state),
  };
}

export function getRoleView<R extends Role>(state: GameState, role: R): RoleViews[R] {
  return getRoleViews(state)[role];
}

export function getSpectatorView(state: GameState): SpectatorView {
  const ended = state.mission.phase === "victory" || state.mission.phase === "failure";
  return {
    ...base(state),
    role: "spectator",
    hazards: ended ? state.hazards : state.hazards.filter((h) => h.revealed),
    target: ended ? state.target : null,
    weather: state.weather,
  };
}
