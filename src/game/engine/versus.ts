/**
 * 2v2 "Rescue Showdown" match engine. OWNER: Developer 1 (engine).
 * Implements `VersusEngine` from src/game/versus/contract.ts; the host imports `versusEngine`
 * from "@/game/engine".
 *
 * Two ordinary co-op GameStates (one per team) built from the same seed and stepped with the same
 * dtMs, so physics, collisions, sonar, radio and hidden-information rules are reused unchanged.
 *
 * Each world keeps the co-op single survivor (GameState.target). A rescue counts once and the next
 * survivor in the shared sequence (./survivors.ts) appears; a hull at 0 is a wipeout that respawns
 * the boat at the start. Either way the world stays active until the shared clock ends the match.
 */
import { decideWinner, TEAMS, VERSUS, versusRoleMay } from "../versus/contract";
import type {
  MatchActionResult,
  MatchEvent,
  MatchResult,
  MatchScoreboard,
  MatchStepResult,
  PlayerTeamAssignment,
  RescueEvent,
  SpectatorMatchView,
  TeamId,
  TeamScore,
  TeamViews,
  TeamWorld,
  VersusEngine,
  VersusMatchState,
  VersusViews,
} from "../versus/contract";
import { BOAT, MISSION } from "../config";
import type { GameState, PlayerAction, PlayerActionType, Role } from "../types";
import { applyAction as applyGameAction } from "./actions";
import { scoreMission } from "./score";
import { createInitialState } from "./state";
import { step as stepGame } from "./step";
import { survivorSpawn } from "./survivors";
import { getCaptainView, getRadioView, getSonarView, getSpectatorView as getGameSpectatorView } from "./views";

/**
 * The co-op role the world's own permission check expects for each versus action: the Navigator
 * is Sonar and Radio in one seat. versusRoleMay() has already checked the versus role.
 */
const ENGINE_SENDER: Partial<Record<PlayerActionType, Role>> = {
  STEER: "captain",
  SET_THROTTLE: "captain",
  SONAR_PING: "sonar",
  MARK_HAZARD: "sonar",
  RADIO_SCAN: "radio",
  MARK_TARGET: "radio",
};

function createWorld(team: TeamId, seed: number, matchId: string): TeamWorld {
  const state = createInitialState({ seed, gameId: matchId });
  return {
    team,
    state: { ...state, mission: { ...state.mission, durationMs: VERSUS.matchDurationMs } },
    rescues: 0,
    wipeouts: 0,
    lastRescueAtMs: null,
    rescueLog: [],
  };
}

function mapTeams(match: VersusMatchState, fn: (world: TeamWorld) => TeamWorld): Record<TeamId, TeamWorld> {
  return { blue: fn(match.teams.blue), red: fn(match.teams.red) };
}

export function createMatch({ seed, matchId }: { seed: number; matchId: string }): VersusMatchState {
  return {
    matchId,
    seed,
    tick: 0,
    phase: "briefing",
    countdownRemainingMs: 0,
    elapsedMs: 0,
    durationMs: VERSUS.matchDurationMs,
    teams: { blue: createWorld("blue", seed, matchId), red: createWorld("red", seed, matchId) },
    result: null,
  };
}

export function startMatch(match: VersusMatchState): MatchStepResult {
  if (match.phase !== "briefing") return { match, events: [] };
  return {
    match: { ...match, phase: "countdown", countdownRemainingMs: VERSUS.countdownMs },
    events: [{ type: "MATCH_COUNTDOWN", countdownMs: VERSUS.countdownMs }],
  };
}

export function applyMatchAction(
  match: VersusMatchState,
  slot: PlayerTeamAssignment,
  action: PlayerAction,
): MatchActionResult {
  if (!versusRoleMay(slot.role, action.type)) return { match, events: [], rejected: "not_permitted" };
  if (match.phase !== "active") return { match, events: [], rejected: "wrong_phase" };
  const world = match.teams[slot.team];
  const r = applyGameAction(world.state, action, ENGINE_SENDER[action.type] ?? null);
  if (r.rejected) return { match, events: [], rejected: r.rejected };
  return {
    match: { ...match, teams: { ...match.teams, [slot.team]: { ...world, state: r.state } } },
    events: r.events.map((event): MatchEvent => ({ type: "TEAM_GAME_EVENT", team: slot.team, event })),
    rejected: null,
  };
}

/**
 * Back to "active" after a rescue or a wipeout, so the team keeps playing. If that same step also
 * ran the clock out, end the world as the co-op timeout it would otherwise have been: the match
 * ends this step anyway, and the spectator view only reveals a world's survivor once it has ended.
 */
function resume(state: GameState): GameState {
  const { mission } = state;
  if (mission.elapsedMs >= mission.durationMs) {
    return { ...state, mission: { ...mission, phase: "failure", failureReason: "timeout", score: scoreMission(state, "failure") } };
  }
  return { ...state, mission: { ...mission, phase: "active", failureReason: null, score: null } };
}

/** The next survivor appears and everything that tracked the old one is cleared. */
function nextSurvivor(state: GameState, seed: number, survivorIndex: number): GameState {
  return {
    ...state,
    target: { ...state.target, position: survivorSpawn(seed, survivorIndex, state.hazards, state.boat.position) },
    // lastScanAtMs stays, so the scan cooldown still holds across a rescue.
    radio: { ...state.radio, readings: [] },
    markers: state.markers.filter((m) => m.kind !== "target_guess"),
    sonar: { ...state.sonar, contacts: state.sonar.contacts.filter((c) => c.kind !== "gull") },
  };
}

function stepWorld(world: TeamWorld, seed: number, dtMs: number, events: MatchEvent[]): TeamWorld {
  const wasActive = world.state.mission.phase === "active";
  const r = stepGame(world.state, dtMs);
  for (const event of r.events) {
    if (event.type !== "MISSION_ENDED") events.push({ type: "TEAM_GAME_EVENT", team: world.team, event });
  }
  if (!wasActive) return { ...world, state: r.state };
  const { phase, failureReason, elapsedMs } = r.state.mission;

  // Co-op precedence already decided this step: hull_destroyed > victory > timeout. So a sunk
  // boat never also rescues, and a rescue on the final step still counts.
  if (phase === "victory") {
    const rescue: RescueEvent = {
      team: world.team,
      survivorIndex: world.rescues,
      position: { ...r.state.target.position },
      atMs: elapsedMs,
    };
    events.push({ type: "SURVIVOR_RESCUED", rescue });
    return {
      ...world,
      state: resume(nextSurvivor(r.state, seed, world.rescues + 1)),
      rescues: world.rescues + 1,
      lastRescueAtMs: elapsedMs,
      rescueLog: [...world.rescueLog, rescue],
    };
  }
  // Wipeout: back to the start with a full hull; the trip back is the penalty. Throttle and rudder
  // are kept so the Driver's controls still show what the boat is doing. The survivor stays put.
  if (phase === "failure" && failureReason === "hull_destroyed") {
    events.push({ type: "BOAT_WIPEOUT", team: world.team, atMs: elapsedMs });
    const boat = {
      ...r.state.boat,
      position: { x: MISSION.boatStart.x, y: MISSION.boatStart.y },
      heading: MISSION.boatStartHeading,
      speed: 0,
      hull: BOAT.startHull,
    };
    return { ...world, state: resume({ ...r.state, boat }), wipeouts: world.wipeouts + 1 };
  }
  return { ...world, state: r.state };
}

function teamScore(world: TeamWorld): TeamScore {
  return {
    team: world.team,
    rescues: world.rescues,
    wipeouts: world.wipeouts,
    hull: world.state.boat.hull,
    lastRescueAtMs: world.lastRescueAtMs,
  };
}

function scoresOf(match: VersusMatchState): Record<TeamId, TeamScore> {
  return { blue: teamScore(match.teams.blue), red: teamScore(match.teams.red) };
}

export function stepMatch(match: VersusMatchState, dtMs: number): MatchStepResult {
  if (match.phase === "countdown") {
    const countdownRemainingMs = match.countdownRemainingMs - dtMs;
    if (countdownRemainingMs > 0) return { match: { ...match, tick: match.tick + 1, countdownRemainingMs }, events: [] };
    // GO: both worlds start on the same tick, so their clocks stay identical from here on.
    const teams = mapTeams(match, (w) => ({ ...w, state: applyGameAction(w.state, { type: "START_GAME" }, "host").state }));
    return {
      match: { ...match, tick: match.tick + 1, phase: "active", countdownRemainingMs: 0, elapsedMs: 0, teams },
      events: [{ type: "MATCH_STARTED", atMs: 0 }],
    };
  }
  if (match.phase !== "active") return { match, events: [] };

  const events: MatchEvent[] = [];
  const teams = mapTeams(match, (w) => stepWorld(w, match.seed, dtMs, events));
  const elapsedMs = Math.min(match.elapsedMs + dtMs, match.durationMs);
  const next: VersusMatchState = { ...match, tick: match.tick + 1, elapsedMs, teams };
  if (elapsedMs < match.durationMs) return { match: next, events };

  const scores = scoresOf(next);
  const result: MatchResult = { winner: decideWinner(scores), scores, endedAtMs: elapsedMs };
  return { match: { ...next, phase: "ended", result }, events: [...events, { type: "MATCH_ENDED", result }] };
}

function teamViews(match: VersusMatchState, team: TeamId): TeamViews {
  const state = match.teams[team].state;
  const common = { team, matchId: match.matchId, tick: match.tick };
  return {
    captain: { ...common, role: "captain", captain: getCaptainView(state) },
    navigator: { ...common, role: "navigator", sonar: getSonarView(state), radio: getRadioView(state) },
  };
}

export function getMatchViews(match: VersusMatchState): VersusViews {
  return { blue: teamViews(match, "blue"), red: teamViews(match, "red") };
}

export function getScoreboard(match: VersusMatchState): MatchScoreboard {
  const scores = scoresOf(match);
  return {
    matchId: match.matchId,
    phase: match.phase,
    countdownRemainingMs: match.countdownRemainingMs,
    elapsedMs: match.elapsedMs,
    durationMs: match.durationMs,
    scores,
    leader: decideWinner(scores),
    result: match.result,
  };
}

export function getMatchSpectatorView(match: VersusMatchState): SpectatorMatchView {
  const recentRescues = TEAMS.flatMap((team) => match.teams[team].rescueLog)
    .sort((a, b) => a.atMs - b.atMs)
    .slice(-VERSUS.recentRescuesKept);
  return {
    role: "spectator",
    matchId: match.matchId,
    tick: match.tick,
    scoreboard: getScoreboard(match),
    teams: { blue: getGameSpectatorView(match.teams.blue.state), red: getGameSpectatorView(match.teams.red.state) },
    recentRescues,
  };
}

export const versusEngine: VersusEngine = {
  createMatch,
  startMatch,
  applyAction: applyMatchAction,
  step: stepMatch,
  getViews: getMatchViews,
  getScoreboard,
  getSpectatorView: getMatchSpectatorView,
};
