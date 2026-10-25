/**
 * 2v2 MOCK DATA — for building the versus UI before the host session and engine are finished.
 *
 * Hand-written and scripted; NOT produced by the engine and NOT synchronized across devices.
 * Anything rendered from it must show <ModeBadge mode="mock" | "preview" />.
 *
 * Shared, additive only: add fixtures freely; don't change existing ones without telling the
 * team (previews and contract.test.ts rely on them).
 */
import {
  MOCK_CAPTAIN_VIEW,
  MOCK_GAME_STATE,
  MOCK_RADIO_VIEW,
  MOCK_SONAR_VIEW,
  MOCK_SPECTATOR_VIEW,
  scriptedBoatAt,
} from "../mock-state";
import type { BoatState, MissionState, SpectatorView } from "../types";
import { decideWinner, VERSUS } from "./contract";
import type {
  MatchPhase,
  MatchResult,
  MatchScoreboard,
  RescueEvent,
  SpectatorMatchView,
  TeamId,
  TeamScore,
  TeamViews,
  VersusRoom,
  VersusViews,
} from "./contract";

export const MOCK_VERSUS_ROOM: VersusRoom = {
  code: "DEMO",
  hostId: "host-demo",
  status: "lobby",
  createdAt: 1_761_300_000_000,
  players: [
    { id: "p-ana", name: "Ana", slot: { team: "blue", role: "captain" }, connected: true, joinedAt: 1_761_300_001_000 },
    { id: "p-ben", name: "Ben", slot: { team: "red", role: "captain" }, connected: true, joinedAt: 1_761_300_002_000 },
    { id: "p-cam", name: "Cam", slot: { team: "blue", role: "navigator" }, connected: true, joinedAt: 1_761_300_003_000 },
    { id: "p-dee", name: "Dee", slot: { team: "red", role: "navigator" }, connected: false, joinedAt: 1_761_300_004_000 },
  ],
};

/**
 * Scripted rescues (match ms). Red pulls level late and steals it in the final countdown, so
 * previews show lead changes, a tie, the final 10 s and a comeback result.
 */
const RESCUE_TIMES: Record<TeamId, readonly number[]> = {
  blue: [18_000, 47_000, 81_000, 104_000],
  red: [24_000, 52_000, 70_000, 96_000, 115_000],
};

const RESCUE_SPOTS = [
  { x: 0.82, y: 0.12 },
  { x: 0.2, y: 0.25 },
  { x: 0.7, y: 0.45 },
  { x: 0.35, y: 0.15 },
  { x: 0.6, y: 0.2 },
] as const;

/** Countdown, the full match, then 8 s on the results screen. */
export const MOCK_MATCH_CYCLE_MS = VERSUS.countdownMs + VERSUS.matchDurationMs + 8_000;

function clockAt(tMs: number): { phase: MatchPhase; countdownRemainingMs: number; elapsedMs: number } {
  const c = ((tMs % MOCK_MATCH_CYCLE_MS) + MOCK_MATCH_CYCLE_MS) % MOCK_MATCH_CYCLE_MS;
  if (c < VERSUS.countdownMs) return { phase: "countdown", countdownRemainingMs: VERSUS.countdownMs - c, elapsedMs: 0 };
  const elapsedMs = c - VERSUS.countdownMs;
  if (elapsedMs < VERSUS.matchDurationMs) return { phase: "active", countdownRemainingMs: 0, elapsedMs };
  return { phase: "ended", countdownRemainingMs: 0, elapsedMs: VERSUS.matchDurationMs };
}

function rescuesAt(team: TeamId, elapsedMs: number): RescueEvent[] {
  return RESCUE_TIMES[team]
    .filter((atMs) => atMs <= elapsedMs)
    .map((atMs, survivorIndex) => ({
      team,
      survivorIndex,
      position: { ...(RESCUE_SPOTS[survivorIndex % RESCUE_SPOTS.length] ?? RESCUE_SPOTS[0]) },
      atMs,
    }));
}

function scoreAt(team: TeamId, elapsedMs: number): TeamScore {
  const log = rescuesAt(team, elapsedMs);
  return {
    team,
    rescues: log.length,
    wipeouts: team === "red" && elapsedMs >= 60_000 ? 1 : 0,
    hull: team === "blue" ? 75 : 50,
    lastRescueAtMs: log.at(-1)?.atMs ?? null,
  };
}

export function mockScoreboardAt(tMs: number): MatchScoreboard {
  const clock = clockAt(tMs);
  const scores = { blue: scoreAt("blue", clock.elapsedMs), red: scoreAt("red", clock.elapsedMs) };
  const result: MatchResult | null =
    clock.phase === "ended" ? { winner: decideWinner(scores), scores, endedAtMs: VERSUS.matchDurationMs } : null;
  return { matchId: "mock-match-1", ...clock, durationMs: VERSUS.matchDurationMs, scores, leader: decideWinner(scores), result };
}

export const MOCK_RESULT_RED_WINS: MatchResult = mockScoreboardAt(MOCK_MATCH_CYCLE_MS - 1).result ?? {
  winner: "red",
  scores: { blue: scoreAt("blue", VERSUS.matchDurationMs), red: scoreAt("red", VERSUS.matchDurationMs) },
  endedAtMs: VERSUS.matchDurationMs,
};

export const MOCK_RESULT_TIE: MatchResult = {
  winner: null,
  scores: {
    blue: { team: "blue", rescues: 0, wipeouts: 1, hull: 100, lastRescueAtMs: null },
    red: { team: "red", rescues: 0, wipeouts: 0, hull: 50, lastRescueAtMs: null },
  },
  endedAtMs: VERSUS.matchDurationMs,
};

/** Red's scripted boat runs the same loop a few seconds behind, mirrored east–west. */
function boatAt(team: TeamId, tMs: number): BoatState {
  if (team === "blue") return scriptedBoatAt(tMs);
  const b = scriptedBoatAt(tMs + 6_000);
  return { ...b, position: { x: 1 - b.position.x, y: b.position.y }, heading: (2 * Math.PI - b.heading) % (2 * Math.PI), hull: 50 };
}

/** A team world's MissionState as the engine reports it (worlds sit in briefing during the countdown). */
function missionAt(tMs: number): MissionState {
  const { phase, elapsedMs } = clockAt(tMs);
  const worldPhase: MissionState["phase"] = phase === "countdown" ? "briefing" : phase === "active" ? "active" : "failure";
  return {
    phase: worldPhase,
    elapsedMs,
    durationMs: VERSUS.matchDurationMs,
    failureReason: phase === "ended" ? "timeout" : null,
    score: null,
  };
}

function teamViewsAt(team: TeamId, tMs: number): TeamViews {
  const tick = Math.floor(tMs / (1000 / 30));
  const patch = { boat: boatAt(team, tMs), mission: missionAt(tMs), tick };
  const common = { team, matchId: "mock-match-1", tick };
  return {
    captain: { ...common, role: "captain", captain: { ...MOCK_CAPTAIN_VIEW, ...patch }, survivor: null },
    navigator: {
      ...common,
      role: "navigator",
      sonar: { ...MOCK_SONAR_VIEW, ...patch },
      radio: { ...MOCK_RADIO_VIEW, ...patch },
    },
  };
}

export function mockVersusViewsAt(tMs: number): VersusViews {
  return { blue: teamViewsAt("blue", tMs), red: teamViewsAt("red", tMs) };
}

function spectatorTeamAt(team: TeamId, tMs: number): SpectatorView {
  const ended = clockAt(tMs).phase === "ended";
  return {
    ...MOCK_SPECTATOR_VIEW,
    tick: Math.floor(tMs / (1000 / 30)),
    boat: boatAt(team, tMs),
    mission: missionAt(tMs),
    target: ended ? MOCK_GAME_STATE.target : null,
  };
}

export function mockSpectatorMatchViewAt(tMs: number): SpectatorMatchView {
  const scoreboard = mockScoreboardAt(tMs);
  const recentRescues = [...rescuesAt("blue", scoreboard.elapsedMs), ...rescuesAt("red", scoreboard.elapsedMs)]
    .sort((a, b) => a.atMs - b.atMs)
    .slice(-VERSUS.recentRescuesKept);
  return {
    role: "spectator",
    matchId: scoreboard.matchId,
    tick: Math.floor(tMs / (1000 / 30)),
    scoreboard,
    teams: { blue: spectatorTeamAt("blue", tMs), red: spectatorTeamAt("red", tMs) },
    recentRescues,
  };
}

/** Preview shortcuts: mock time (ms) at which each moment of the scripted match starts. */
export const MOCK_MOMENTS = {
  countdown: 0,
  start: VERSUS.countdownMs,
  finalCountdown: VERSUS.countdownMs + VERSUS.matchDurationMs - VERSUS.finalCountdownMs,
  results: VERSUS.countdownMs + VERSUS.matchDurationMs,
} as const;

/**
 * Additive fixture for Navigator callout tests / manual checks: boat heading north,
 * a fresh gull contact dead ahead (12 o'clock, CLOSE).
 */
export function mockNavigatorGullDeadAhead(team: TeamId = "blue"): VersusViews[TeamId]["navigator"] {
  const base = teamViewsAt(team, MOCK_MOMENTS.start + 5_000).navigator;
  const now = base.sonar.mission.elapsedMs;
  const boat = { ...base.sonar.boat, position: { x: 0.5, y: 0.55 }, heading: 0 };
  return {
    ...base,
    sonar: {
      ...base.sonar,
      boat,
      contacts: [
        {
          hazardId: "gull",
          position: { x: 0.5, y: 0.48 },
          radius: 0.04,
          kind: "gull",
          detectedAtMs: now,
        },
      ],
      lastPingAtMs: now,
      lastPingOrigin: { ...boat.position },
      pingReadyAtMs: now + 3_000,
    },
    radio: { ...base.radio, boat },
  };
}
