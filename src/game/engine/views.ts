/**
 * Hidden-information filtering: GameState (host only) → per-role views (sent to devices).
 * OWNER: Developer 1 (engine). This is the ONLY place that decides who sees what.
 *
 * Rules (see docs/CONTRACTS.md "Hidden information"):
 * - Nobody but the engine sees `target` until the mission ends (spectator gets it at the end;
 *   the versus BIG SCREEN gets it live via getLiveSpectatorView — no phone ever does),
 *   except Sonar: a ping in range records a "gull" contact (actions.ts), shown only in the Sonar view,
 *   and, in versus only, the Captain once the survivor is in lookout range (getCaptainSurvivor).
 * - The captain sees hazards within CAPTAIN.visualRange, plus sonar contacts for a few seconds.
 * - Only the weather specialist gets the forecast and exact current numbers.
 */
import { CAPTAIN, RADIO, SONAR, WEATHER } from "../config";
import type { CaptainView, GameState, RadioView, Role, RoleViews, SonarView, SpectatorView, Vec2, WeatherView } from "../types";
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
export interface CaptainViewOptions {
  /** Lookout radius (co-op: CAPTAIN.visualRange). */
  visualRange: number;
  /** How long a Sonar contact also shows on the Captain's screen (co-op: CAPTAIN_VIEW.sonarRevealMs). */
  sonarRevealMs: number;
}

const COOP_CAPTAIN: CaptainViewOptions = { visualRange: CAPTAIN.visualRange, sonarRevealMs: CAPTAIN_VIEW.sonarRevealMs };

export function getCaptainView(state: GameState, options: CaptainViewOptions = COOP_CAPTAIN): CaptainView {
  const shieldActive = isShieldActive(state.weather, state.mission.elapsedMs);
  const freshContacts = new Set(
    state.sonar.contacts
      .filter((c) => state.mission.elapsedMs - c.detectedAtMs < options.sonarRevealMs)
      .map((c) => c.hazardId),
  );
  return {
    ...base(state),
    role: "captain",
    visibleHazards: state.hazards.filter(
      (h) => freshContacts.has(h.id) || dist(h.position, state.boat.position) <= options.visualRange + h.radius,
    ),
    current: state.weather.current,
    stormIntensity: state.weather.stormIntensity,
    shieldActive,
  };
}

/**
 * VERSUS ONLY (contract versus-2, VersusCaptainView.survivor): the survivor's position once their
 * rescue ring reaches the Driver's lookout circle, the same "any part in range" rule as hazards.
 * The ring (not the point) matters: the versus lookout is smaller than the rescue radius, so a
 * point rule would rescue the person before the Driver could ever see them. Co-op never calls this.
 */
export function getCaptainSurvivor(state: GameState, visualRange: number): Vec2 | null {
  const { position, rescueRadius } = state.target;
  return dist(position, state.boat.position) <= visualRange + rescueRadius ? { ...position } : null;
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

/**
 * VERSUS big screen only: the spectator view WITH the live survivor while the match runs, so the
 * room can see what the crews are racing for (audit r9). The laptop is a shared screen, not a
 * seat: no phone view ever uses this. Co-op keeps getSpectatorView (target only after the end).
 */
export function getLiveSpectatorView(state: GameState): SpectatorView {
  return { ...getSpectatorView(state), target: { ...state.target, position: { ...state.target.position } } };
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
