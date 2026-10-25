/**
 * 2v2 "Rescue Showdown" match engine. OWNER: Developer 1 (engine).
 * Implements `VersusEngine` from src/game/versus/contract.ts; the host imports `versusEngine`
 * from "@/game/engine".
 *
 * Two ordinary co-op GameStates (one per team) built from the same seed and stepped with the same
 * dtMs, so physics, collisions, sonar, radio and hidden-information rules are reused unchanged.
 *
 * Both crews share one ocean and race for ONE survivor at a time (contract versus-3): each world
 * keeps an identical copy of it in the co-op GameState.target. The first boat to reach it scores
 * (resolveRescue), then the next survivor in the shared sequence (./survivors.ts) appears in both
 * worlds. Each crew starts and respawns at its own dock berth (dockFor). Touching land (sandbars, rocks) runs
 * the boat aground and jellyfish stings taking the hull to 0 wreck it; both are wipeouts that
 * respawn the boat at the start. Either way the world stays active until the shared clock ends
 * the match. Versus-only tuning (VERSUS_RULES) is passed into the co-op step and views, whose
 * defaults keep co-op unchanged.
 */
import { decideWinner, hazardClass, TEAMS, VERSUS, versusRoleMay } from "../versus/contract";
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
import { BOAT, MISSION, RADIO } from "../config";
import type { GameState, PlayerAction, PlayerActionType, Role, SectorId, Vec2 } from "../types";
import { sectorCenter, sectorOf } from "../sectors";
import { applyAction as applyGameAction, validateAction } from "./actions";
import { scoreMission } from "./score";
import { createInitialState } from "./state";
import { step as stepGame, type StepTuning } from "./step";
import { besideFormation, landBetween, reachability, withFormations, withJellies } from "./formations";
import { survivorSpawn } from "./survivors";
import {
  getCaptainSurvivor,
  getCaptainView,
  getLiveSpectatorView,
  getRadioView,
  getSonarView,
  getSpectatorView as getGameSpectatorView,
  type CaptainViewOptions,
} from "./views";

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

/** Engine-owned versus tuning (playtest round 2). Identical for both teams. */
export const VERSUS_RULES = {
  /** Boats are this much faster than co-op (top speed and acceleration). */
  boatSpeedFactor: 1.5,
  /** Pickup radius (co-op TARGET.rescueRadius is 0.05): a little more forgiving at the higher speed. */
  rescueRadius: 0.06,
  /** A drone contact also shows on the Driver's screen this long (co-op: 5 s). */
  captainSonarRevealMs: 3_000,
  /** Both crews share one ocean, so each has its own dock berth this far left (blue) / right (red) of MISSION.boatStart. */
  dockOffsetX: 0.05,
  /**
   * Versus currents (base and every gust) are this fraction of the seeded co-op weather (playtest
   * r5: nobody steers the current in versus, so full-strength gusts just felt like lost control).
   * The survivor's drift follows the scaled current too. Identical for both crews.
   */
  currentFactor: 0.5,
  /**
   * Radio readings in versus come in three levels spread across the board (playtest r6: with the
   * co-op falloff most squares read nothing). 3 bars = the person is in that square; 2 bars = the
   * square's centre is within this many squares of them; 1 bar = within signalOneBarSquares.
   */
  signalTwoBarsSquares: 1.6,
  signalOneBarSquares: 3,
  /**
   * Spawn preference: "beside a formation" means the person is within this of a formation's rim.
   * Spawns already keep rescueRadius + LAYOUT.targetClearance (0.12) from every rim.
   */
  besideReefWithin: 0.18,
} as const;

/**
 * Versus radio reading for a square: 1 (3 bars) in the person's own square, else 0.67 / 0.33 / 0
 * by how many squares away its centre is. Discrete on purpose: the bars ARE the clue, and coarse
 * rings make the Navigator combine several scans and talk it through.
 */
export function versusSignalStrength(target: Vec2, sector: SectorId): number {
  if (sectorOf(target) === sector) return 1;
  const c = sectorCenter(sector);
  const squares = Math.hypot(target.x - c.x, target.y - c.y) * RADIO.grid;
  if (squares <= VERSUS_RULES.signalTwoBarsSquares) return 0.67;
  if (squares <= VERSUS_RULES.signalOneBarSquares) return 0.33;
  return 0;
}

const scaleCurrent = (v: Vec2): Vec2 => ({ x: v.x * VERSUS_RULES.currentFactor, y: v.y * VERSUS_RULES.currentFactor });

/** Where a team's boat starts and respawns. */
export function dockFor(team: TeamId): Vec2 {
  const side = team === "blue" ? -1 : 1;
  return { x: MISSION.boatStart.x + side * VERSUS_RULES.dockOffsetX, y: MISSION.boatStart.y };
}

const RIVAL: Record<TeamId, TeamId> = { blue: "red", red: "blue" };

const VERSUS_STEP: StepTuning = { boatSpeedFactor: VERSUS_RULES.boatSpeedFactor };
const VERSUS_CAPTAIN: CaptainViewOptions = {
  visualRange: VERSUS.captainVisualRange,
  sonarRevealMs: VERSUS_RULES.captainSonarRevealMs,
};

const DOCKS: readonly Vec2[] = [dockFor("blue"), dockFor("red")];

function createWorld(team: TeamId, seed: number, matchId: string): TeamWorld {
  const state = createInitialState({ seed, gameId: matchId });
  // Same seed and inputs for both crews, so both worlds get the identical reef field.
  const hazards = withJellies(
    seed,
    withFormations(seed, state.hazards, DOCKS, state.target.position, VERSUS_RULES.rescueRadius),
  );
  return {
    team,
    state: {
      ...state,
      boat: { ...state.boat, position: dockFor(team) },
      hazards,
      target: { ...state.target, rescueRadius: VERSUS_RULES.rescueRadius },
      weather: {
        ...state.weather,
        current: scaleCurrent(state.weather.current),
        forecast: state.weather.forecast.map((entry) => ({ ...entry, current: scaleCurrent(entry.current) })),
      },
      mission: { ...state.mission, durationMs: VERSUS.matchDurationMs },
    },
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
  const sender = ENGINE_SENDER[action.type] ?? null;
  const withState = (state: GameState, events: MatchEvent[]): MatchActionResult => ({
    match: { ...match, teams: { ...match.teams, [slot.team]: { ...world, state } } },
    events,
    rejected: null,
  });

  // Hazard marks are capped per crew (VERSUS.maxHazardMarks). Tapping one of your marks removes
  // it; a new mark beyond the cap is refused (the UI explains how to free a slot). Each crew has
  // its own world, so the cap is per team. Radio pins (MARK_TARGET) never count.
  if (action.type === "MARK_HAZARD") {
    const invalid = validateAction(world.state, action, sender);
    if (invalid) return { match, events: [], rejected: invalid };
    const hazardMarks = world.state.markers.filter((m) => m.kind === "hazard");
    const gap = (m: { position: Vec2 }) => Math.hypot(m.position.x - action.position.x, m.position.y - action.position.y);
    const [tapped] = hazardMarks.filter((m) => gap(m) <= VERSUS.markRemoveRadius).sort((a, b) => gap(a) - gap(b));
    if (tapped) return withState({ ...world.state, markers: world.state.markers.filter((m) => m.id !== tapped.id) }, []);
    // No dedicated reason in the frozen co-op ActionRejectReason; the phone pre-checks the cap.
    if (hazardMarks.length >= VERSUS.maxHazardMarks) return { match, events: [], rejected: "invalid_payload" };
  }

  const r = applyGameAction(world.state, action, sender);
  if (r.rejected) return { match, events: [], rejected: r.rejected };
  let state = r.state;
  let events = r.events;
  if (action.type === "RADIO_SCAN") {
    const strength = versusSignalStrength(world.state.target.position, action.sector);
    state = {
      ...state,
      radio: { ...state.radio, readings: state.radio.readings.map((x) => (x.sector === action.sector ? { ...x, strength } : x)) },
    };
    events = events.map((e) => (e.type === "RADIO_SCANNED" ? { ...e, strength } : e));
  }
  return withState(state, events.map((event): MatchEvent => ({ type: "TEAM_GAME_EVENT", team: slot.team, event })));
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

/** The survivor moves to `position` and everything this crew had on the old one is cleared. */
function moveSurvivor(state: GameState, position: Vec2): GameState {
  return {
    ...state,
    target: { ...state.target, position: { ...position } },
    // lastScanAtMs stays, so the scan cooldown still holds across a rescue.
    radio: { ...state.radio, readings: [] },
    markers: state.markers.filter((m) => m.kind !== "target_guess"),
    sonar: { ...state.sonar, contacts: state.sonar.contacts.filter((c) => c.kind !== "gull") },
  };
}

/** Back to the crew's dock, stopped, with `hull`. Throttle and rudder are kept so the Driver's controls stay truthful. */
function respawn(state: GameState, team: TeamId, hull: number): GameState {
  const boat = {
    ...state.boat,
    position: dockFor(team),
    heading: MISSION.boatStartHeading,
    speed: 0,
    hull,
  };
  return resume({ ...state, boat });
}

interface WorldStep {
  world: TeamWorld;
  /** This boat reached the shared survivor this step (and didn't wipe out). The match decides who scores. */
  reached: boolean;
}

function stepWorld(world: TeamWorld, dtMs: number, events: MatchEvent[]): WorldStep {
  const wasActive = world.state.mission.phase === "active";
  const r = stepGame(world.state, dtMs, VERSUS_STEP);

  // The co-op step damages the hull on every hazard. In versus only jellyfish do: land (sandbars,
  // rocks) runs the boat aground instead, so its hits are re-reported with damage 0.
  const kinds = new Map(world.state.hazards.map((h) => [h.id, h.kind]));
  const isLand = (hazardId: string) => {
    const kind = kinds.get(hazardId);
    return kind !== undefined && hazardClass(kind) === "land";
  };
  let aground = false;
  let jellyDamage = 0;
  for (const event of r.events) {
    if (event.type === "MISSION_ENDED") continue;
    if (event.type === "HAZARD_HIT" && isLand(event.hazardId)) {
      aground = true;
      events.push({ type: "TEAM_GAME_EVENT", team: world.team, event: { ...event, damage: 0 } });
      continue;
    }
    if (event.type === "HAZARD_HIT") jellyDamage += event.damage;
    events.push({ type: "TEAM_GAME_EVENT", team: world.team, event });
  }
  if (!wasActive) return { world: { ...world, state: r.state }, reached: false };
  const elapsedMs = r.state.mission.elapsedMs;
  // Recomputed rather than read from the co-op step, which also took land damage. (A sting in the
  // same step as a land hit that already drained the co-op hull is lost; the boat is aground anyway.)
  const hull = Math.max(0, world.state.boat.hull - jellyDamage);

  // Precedence, like co-op's "sunk beats rescue": wrecked > aground > rescue > timeout. The
  // survivor stays where it is on a wipeout; the trip back from the dock is the penalty.
  if (hull <= 0 || aground) {
    const cause = hull <= 0 ? "wrecked" : "aground";
    events.push({ type: "BOAT_WIPEOUT", team: world.team, atMs: elapsedMs, cause });
    // Either way the boat comes back from the dock repaired (playtest r5): the trip is the penalty.
    const state = respawn(r.state, world.team, BOAT.startHull);
    return { world: { ...world, state, wipeouts: world.wipeouts + 1 }, reached: false };
  }
  return { world: { ...world, state: r.state }, reached: r.state.mission.phase === "victory" };
}

/**
 * Both crews race for ONE survivor (contract versus-3). Each world holds an identical copy of it
 * (same spawn, same drift from the same currents and hazards), so whoever reached it this step is
 * known per world. The closer boat wins a same-step race; an exact tie goes to the crew with fewer
 * rescues, then blue (deterministic). The next survivor then appears in BOTH worlds, away from
 * both boats, and both crews' tracking of the old one is cleared.
 */
function resolveRescue(
  steps: Record<TeamId, WorldStep>,
  seed: number,
  events: MatchEvent[],
): Record<TeamId, TeamWorld> {
  const { blue, red } = steps;
  const racers = TEAMS.filter((team) => steps[team].reached);
  if (racers.length === 0) return { blue: blue.world, red: red.world };

  const gap = (team: TeamId) => {
    const s = steps[team].world.state;
    return Math.hypot(s.boat.position.x - s.target.position.x, s.boat.position.y - s.target.position.y);
  };
  const [winner] = [...racers].sort(
    (a, b) => gap(a) - gap(b) || steps[a].world.rescues - steps[b].world.rescues || (a === "blue" ? -1 : 1),
  );
  if (!winner) return { blue: blue.world, red: red.world };

  const won = steps[winner].world;
  const survivorIndex = blue.world.rescues + red.world.rescues;
  const atMs = won.state.mission.elapsedMs;
  const rescue: RescueEvent = { team: winner, survivorIndex, position: { ...won.state.target.position }, atMs };
  events.push({ type: "SURVIVOR_RESCUED", rescue });

  const boats = [blue.world.state.boat.position, red.world.state.boat.position];
  const next = survivorSpawn(
    seed,
    survivorIndex + 1,
    won.state.hazards,
    boats,
    won.state.target.rescueRadius,
    // Never behind a reef formation with no way in from the docks.
    reachability(won.state.hazards, DOCKS).reaches,
    // Prefer someone neither crew can drive straight at (playtest r7): land between them and
    // BOTH boats, else at least the nearer boat (the crew that could otherwise dash straight in).
    // Same boats list for both worlds, so both get the same person.
    [
      (p) => boats.every((b) => landBetween(b, p, won.state.hazards)),
      (p) => landBetween(nearest(boats, p), p, won.state.hazards),
      // Otherwise tucked in beside a reef formation (just outside the usual spawn clearance).
      (p) => besideFormation(p, won.state.hazards, VERSUS_RULES.besideReefWithin),
    ],
  );
  const settle = (world: TeamWorld): TeamWorld => {
    const scored = world.team === winner;
    return {
      ...world,
      // A crew that also reached the survivor but lost the race is back to "active" too.
      state: resume(moveSurvivor(world.state, next)),
      rescues: scored ? world.rescues + 1 : world.rescues,
      lastRescueAtMs: scored ? atMs : world.lastRescueAtMs,
      rescueLog: scored ? [...world.rescueLog, rescue] : world.rescueLog,
    };
  };
  return { blue: settle(blue.world), red: settle(red.world) };
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
  const steps = { blue: stepWorld(match.teams.blue, dtMs, events), red: stepWorld(match.teams.red, dtMs, events) };
  const teams = resolveRescue(steps, match.seed, events);
  const elapsedMs = Math.min(match.elapsedMs + dtMs, match.durationMs);
  const next: VersusMatchState = { ...match, tick: match.tick + 1, elapsedMs, teams };
  if (elapsedMs < match.durationMs) return { match: next, events };

  const scores = scoresOf(next);
  const result: MatchResult = { winner: decideWinner(scores), scores, endedAtMs: elapsedMs };
  return { match: { ...next, phase: "ended", result }, events: [...events, { type: "MATCH_ENDED", result }] };
}

const nearest = (boats: readonly Vec2[], p: Vec2): Vec2 =>
  boats.reduce((best, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? b : best));

/** Inside the Driver's boat-centred window (contract versus-3: |dx|, |dy| <= captainWindowSpan / 2). */
function inWindow(boat: Vec2, other: Vec2): boolean {
  const half = VERSUS.captainWindowSpan / 2;
  return Math.abs(other.x - boat.x) <= half && Math.abs(other.y - boat.y) <= half;
}

function teamViews(match: VersusMatchState, team: TeamId): TeamViews {
  const state = match.teams[team].state;
  // Not hidden information: both boats are on the shared spectator map.
  const rival = match.teams[RIVAL[team]].state.boat.position;
  const common = { team, matchId: match.matchId, tick: match.tick };
  return {
    captain: {
      ...common,
      role: "captain",
      captain: getCaptainView(state, VERSUS_CAPTAIN),
      survivor: getCaptainSurvivor(state, VERSUS.captainVisualRange),
      rival: inWindow(state.boat.position, rival) ? { ...rival } : null,
    },
    navigator: {
      ...common,
      role: "navigator",
      sonar: getSonarView(state),
      radio: getRadioView(state),
      rival: { ...rival },
    },
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
  const bigScreen = match.phase === "active" ? getLiveSpectatorView : getGameSpectatorView;
  const recentRescues = TEAMS.flatMap((team) => match.teams[team].rescueLog)
    .sort((a, b) => a.atMs - b.atMs)
    .slice(-VERSUS.recentRescuesKept);
  return {
    role: "spectator",
    matchId: match.matchId,
    tick: match.tick,
    scoreboard: getScoreboard(match),
    // The big screen shows the live survivor once play starts (views.ts decides; phones never get it).
    teams: {
      blue: bigScreen(match.teams.blue.state),
      red: bigScreen(match.teams.red.state),
    },
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
