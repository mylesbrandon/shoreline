/**
 * 2v2 match engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. These pin the versus-1 contract behaviour; they must keep passing once
 * survivors respawn and wipeouts replace the baseline adapter's frozen worlds.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { versusEngine as V } from "./index";
import { NETWORK } from "../config";
import { VERSUS, type PlayerTeamAssignment, type TeamId, type VersusMatchState } from "../versus/contract";
import type { GameState, PlayerAction } from "../types";

const DT = 1000 / NETWORK.simHz;
const BLUE_CAPTAIN: PlayerTeamAssignment = { team: "blue", role: "captain" };
const RED_CAPTAIN: PlayerTeamAssignment = { team: "red", role: "captain" };
const BLUE_NAV: PlayerTeamAssignment = { team: "blue", role: "navigator" };

const fresh = (): VersusMatchState => V.createMatch({ seed: 7, matchId: "match-1" });

/** Start the match and run the countdown out. */
function active(): VersusMatchState {
  let m = V.startMatch(fresh()).match;
  while (m.phase === "countdown") m = V.step(m, DT).match;
  return m;
}

function act(m: VersusMatchState, slot: PlayerTeamAssignment, action: PlayerAction): VersusMatchState {
  const r = V.applyAction(m, slot, action);
  assert.equal(r.rejected, null, `${slot.team} ${slot.role} ${action.type} was rejected: ${r.rejected}`);
  return r.match;
}

function run(m: VersusMatchState, steps: number): VersusMatchState {
  for (let i = 0; i < steps; i++) m = V.step(m, DT).match;
  return m;
}

/** Edit one team's world directly (test setup only). */
function editWorld(m: VersusMatchState, team: TeamId, fn: (s: GameState) => GameState): VersusMatchState {
  return { ...m, teams: { ...m.teams, [team]: { ...m.teams[team], state: fn(m.teams[team].state) } } };
}

/** Calm water, no hazards, unreachable survivor: for movement-only checks. */
const openWater = (s: GameState): GameState => ({
  ...s,
  hazards: [],
  target: { position: { x: -1, y: -1 }, rescueRadius: 0 },
  weather: { ...s.weather, current: { x: 0, y: 0 }, forecast: [] },
});

/** Jump the shared clock (and both worlds' clocks) without simulating. */
function at(m: VersusMatchState, elapsedMs: number): VersusMatchState {
  const jump = (s: GameState): GameState => ({ ...s, mission: { ...s.mission, elapsedMs } });
  return editWorld(editWorld({ ...m, elapsedMs }, "blue", jump), "red", jump);
}

describe("versus: match setup", () => {
  test("both teams get the identical seeded map, survivor and weather", () => {
    const m = fresh();
    assert.equal(m.phase, "briefing");
    assert.equal(m.durationMs, VERSUS.matchDurationMs);
    const { blue, red } = m.teams;
    assert.deepEqual(blue.state.hazards, red.state.hazards);
    assert.deepEqual(blue.state.target, red.state.target);
    assert.deepEqual(blue.state.weather, red.state.weather);
    assert.equal(blue.state.mission.durationMs, VERSUS.matchDurationMs);
    assert.equal(blue.state.gameId, "match-1");
    assert.deepEqual([blue.rescues, red.rescues], [0, 0]);
  });

  test("is deterministic for the same seed", () => {
    assert.deepEqual(fresh(), fresh());
  });
});

describe("versus: countdown and shared clock", () => {
  test("start → countdown → both worlds go active on the same tick", () => {
    const s = V.startMatch(fresh());
    assert.equal(s.match.phase, "countdown");
    assert.deepEqual(s.events, [{ type: "MATCH_COUNTDOWN", countdownMs: VERSUS.countdownMs }]);
    assert.equal(V.startMatch(s.match).events.length, 0, "starting twice is a no-op");

    let m = s.match;
    let started = 0;
    while (m.phase === "countdown") {
      const r = V.step(m, DT);
      started += r.events.filter((e) => e.type === "MATCH_STARTED").length;
      m = r.match;
    }
    assert.equal(started, 1);
    assert.equal(m.phase, "active");
    assert.equal(m.teams.blue.state.mission.phase, "active");
    assert.equal(m.teams.red.state.mission.phase, "active");
  });

  test("phones can't act before GO", () => {
    const m = V.startMatch(fresh()).match;
    assert.equal(V.applyAction(m, BLUE_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 }).rejected, "wrong_phase");
  });

  test("both worlds' clocks equal the match clock", () => {
    const m = run(active(), 90);
    assert.equal(m.teams.blue.state.mission.elapsedMs, m.elapsedMs);
    assert.equal(m.teams.red.state.mission.elapsedMs, m.elapsedMs);
  });
});

describe("versus: permissions and team isolation", () => {
  test("captain steers, navigator sweeps and scans, nobody does the other's job", () => {
    const m = active();
    assert.equal(V.applyAction(m, BLUE_CAPTAIN, { type: "STEER", rudder: 0.5 }).rejected, null);
    assert.equal(V.applyAction(m, BLUE_CAPTAIN, { type: "SONAR_PING" }).rejected, "not_permitted");
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "SONAR_PING" }).rejected, null);
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "RADIO_SCAN", sector: "B2" }).rejected, null);
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "MARK_TARGET", position: { x: 0.5, y: 0.5 } }).rejected, null);
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "STEER", rudder: 1 }).rejected, "not_permitted");
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "WEATHER_SHIELD" }).rejected, "not_permitted");
    assert.equal(V.applyAction(m, BLUE_CAPTAIN, { type: "START_GAME" }).rejected, "not_permitted");
  });

  test("one team's actions only move its own boat", () => {
    let m = editWorld(editWorld(active(), "blue", openWater), "red", openWater);
    const redBefore = m.teams.red.state.boat;
    m = act(m, BLUE_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 });
    m = run(m, 60);
    assert.ok(m.teams.blue.state.boat.position.y < redBefore.position.y - 0.01, "blue moved north");
    assert.deepEqual(m.teams.red.state.boat.position, redBefore.position, "red stayed put");
  });

  test("a navigator's sweep reveals only its own team's world", () => {
    const m = act(active(), BLUE_NAV, { type: "SONAR_PING" });
    assert.equal(m.teams.blue.state.sonar.pingsUsed, 1);
    assert.equal(m.teams.red.state.sonar.pingsUsed, 0);
  });

  test("applyAction and step never mutate their input", () => {
    const m = active();
    const copy = structuredClone(m);
    V.applyAction(m, RED_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 });
    V.step(m, DT);
    assert.deepEqual(m, copy);
  });
});

describe("versus: rescues, timer and winner", () => {
  /** Park a team's boat on its survivor. */
  const onSurvivor = (s: GameState): GameState => ({ ...s, boat: { ...s.boat, position: { ...s.target.position } } });

  test("a rescue is counted exactly once and logged", () => {
    let m = editWorld(active(), "blue", onSurvivor);
    const r = V.step(m, DT);
    const rescues = r.events.filter((e) => e.type === "SURVIVOR_RESCUED");
    assert.equal(rescues.length, 1);
    m = run(r.match, 10);
    assert.equal(m.teams.blue.rescues, 1);
    assert.equal(m.teams.blue.rescueLog.length, 1);
    assert.equal(m.teams.blue.rescueLog[0]?.survivorIndex, 0);
    assert.equal(m.teams.red.rescues, 0);
    assert.equal(V.getScoreboard(m).leader, "blue");
    assert.ok(!r.events.some((e) => e.type === "TEAM_GAME_EVENT" && e.event.type === "MISSION_ENDED"));
  });

  test("the match ends exactly at durationMs and declares the winner once", () => {
    let m = editWorld(active(), "red", onSurvivor);
    m = V.step(m, DT).match;
    m = at(m, VERSUS.matchDurationMs - DT / 2);
    const r = V.step(m, DT);
    assert.equal(r.match.phase, "ended");
    assert.equal(r.match.elapsedMs, VERSUS.matchDurationMs);
    assert.equal(r.match.result?.winner, "red");
    assert.equal(r.events.filter((e) => e.type === "MATCH_ENDED").length, 1);
    assert.equal(V.step(r.match, DT).match, r.match, "an ended match doesn't keep simulating");
    assert.equal(V.applyAction(r.match, RED_CAPTAIN, { type: "STEER", rudder: 0 }).rejected, "wrong_phase");
  });

  test("a full idle match runs out the clock into a tie", () => {
    let m = editWorld(editWorld(active(), "blue", openWater), "red", openWater);
    let ended = 0;
    while (m.phase === "active") {
      const r = V.step(m, DT);
      ended += r.events.filter((e) => e.type === "MATCH_ENDED").length;
      m = r.match;
    }
    assert.equal(ended, 1);
    assert.equal(m.result?.winner, null);
  });
});

describe("versus: views", () => {
  test("each seat gets its team's view; the survivor stays hidden", () => {
    const m = act(active(), BLUE_NAV, { type: "RADIO_SCAN", sector: "A1" });
    const views = V.getViews(m);
    assert.equal(views.blue.captain.role, "captain");
    assert.equal(views.red.navigator.team, "red");
    assert.equal(views.blue.navigator.radio.readings.length, 1);
    assert.equal(views.red.navigator.radio.readings.length, 0);
    assert.equal(views.blue.captain.tick, m.tick);
    for (const team of ["blue", "red"] as const) {
      assert.ok(!("target" in views[team].captain.captain));
      assert.ok(!("target" in views[team].navigator.radio));
      assert.ok(!("target" in views[team].navigator.sonar));
    }
    const spectator = V.getSpectatorView(m);
    assert.equal(spectator.teams.blue.target, null);
    assert.equal(spectator.scoreboard.phase, "active");
  });
});
