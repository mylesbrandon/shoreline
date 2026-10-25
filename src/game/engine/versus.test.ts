/**
 * 2v2 match engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. These pin the versus-1 contract behaviour; they must keep passing once
 * survivors respawn and wipeouts replace the baseline adapter's frozen worlds.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { step as stepGame, versusEngine as V } from "./index";
import { SURVIVORS, survivorSpawn } from "./survivors";
import { BOAT, MISSION, NETWORK } from "../config";
import {
  decideWinner,
  VERSUS,
  type MatchEvent,
  type PlayerTeamAssignment,
  type TeamId,
  type VersusMatchState,
} from "../versus/contract";
import type { GameState, PlayerAction, Vec2 } from "../types";

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

// ---------------------------------------------------------------------------
// Respawning survivors, wipeouts, scoring (Developer 1's versus rules)
// ---------------------------------------------------------------------------

const BOTH: readonly TeamId[] = ["blue", "red"];

/** Park a team's boat on its current survivor. */
const parkOnSurvivor = (s: GameState): GameState => ({ ...s, boat: { ...s.boat, position: { ...s.target.position } } });

/** Put the boat inside its first hazard with `hull` left, so the next step's hit sinks it. */
const onReefWithHull =
  (hull: number) =>
  (s: GameState): GameState => {
    const h = s.hazards[0];
    assert.ok(h, "layout has a hazard");
    return {
      ...s,
      hazards: s.hazards.map((x) => (x.id === h.id ? { ...x, lastHitAtMs: null } : x)),
      boat: { ...s.boat, position: { ...h.position }, hull },
    };
  };

function stepEvents(m: VersusMatchState): { match: VersusMatchState; events: MatchEvent[] } {
  return V.step(m, DT);
}

const count = (events: MatchEvent[], type: MatchEvent["type"]) => events.filter((e) => e.type === type).length;

function assertInvariants(m: VersusMatchState) {
  for (const team of BOTH) {
    const w = m.teams[team];
    assert.equal(w.rescues, w.rescueLog.length, `${team}: rescues === rescueLog.length`);
    w.rescueLog.forEach((r, i) => assert.equal(r.survivorIndex, i, `${team}: rescue ${i} index`));
    if (m.phase === "active") assert.equal(w.state.mission.elapsedMs, m.elapsedMs, `${team}: clock`);
  }
}

describe("versus: survivors respawn", () => {
  test("three rescues in a row count 1/2/3 with indices 0/1/2, one event each, world stays active", () => {
    let m = active();
    const seen: Vec2[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(m.teams.blue.state.target.position);
      const r = stepEvents(editWorld(m, "blue", parkOnSurvivor));
      const rescued = r.events.filter((e) => e.type === "SURVIVOR_RESCUED");
      assert.equal(rescued.length, 1, `rescue ${i}: one event`);
      assert.equal(rescued[0]?.type === "SURVIVOR_RESCUED" && rescued[0].rescue.survivorIndex, i);
      m = r.match;
      const blue = m.teams.blue;
      assert.equal(blue.rescues, i + 1);
      assert.equal(blue.rescueLog[i]?.survivorIndex, i);
      assert.equal(blue.lastRescueAtMs, m.elapsedMs);
      assert.equal(blue.state.mission.phase, "active");
      assert.equal(blue.state.mission.failureReason, null);
      assert.equal(blue.state.mission.score, null);
      assert.notDeepEqual(blue.state.target.position, seen[i], "a new survivor appeared");
      assertInvariants(m);
    }
    assert.equal(m.teams.red.rescues, 0);
    assert.equal(m.phase, "active");
  });

  test("the logged position is where the survivor was picked up", () => {
    const parked = editWorld(active(), "blue", parkOnSurvivor);
    const m = V.step(parked, DT).match;
    const picked = m.teams.blue.rescueLog[0]?.position;
    assert.ok(picked);
    assert.ok(Math.hypot(picked.x - parked.teams.blue.state.boat.position.x, picked.y - parked.teams.blue.state.boat.position.y) < 0.01);
  });

  test("the next survivor spawns valid and away from the rescuing boat", () => {
    const m = V.step(editWorld(active(), "blue", parkOnSurvivor), DT).match;
    const s = m.teams.blue.state;
    assert.deepEqual(s.target.position, survivorSpawn(m.seed, 1, s.hazards, s.boat.position));
    assert.ok(Math.hypot(s.target.position.x - s.boat.position.x, s.target.position.y - s.boat.position.y) >= SURVIVORS.minSpawnFromBoat);
  });

  test("staying parked after a rescue for 30 steps doesn't count again", () => {
    let m = V.step(editWorld(active(), "blue", parkOnSurvivor), DT).match;
    let rescued = 0;
    for (let i = 0; i < 30; i++) {
      const r = stepEvents(m);
      rescued += count(r.events, "SURVIVOR_RESCUED");
      m = r.match;
    }
    assert.equal(rescued, 0);
    assert.equal(m.teams.blue.rescues, 1);
  });

  test("both teams get identical survivors 1..5 when they rescue from the same spots", () => {
    let m = active();
    for (let i = 1; i <= 5; i++) {
      m = V.step(editWorld(editWorld(m, "blue", parkOnSurvivor), "red", parkOnSurvivor), DT).match;
      assert.deepEqual(m.teams.blue.state.target, m.teams.red.state.target, `survivor ${i}`);
      assert.deepEqual([m.teams.blue.rescues, m.teams.red.rescues], [i, i]);
    }
  });

  test("a rescue clears the old survivor's readings, guess pin and Gull contact; hazard marks stay", () => {
    let m = active();
    // Sit just outside the rescue zone but inside sonar range, so the ping catches the Gull.
    m = editWorld(m, "blue", (s) => ({
      ...s,
      boat: { ...s.boat, position: { x: s.target.position.x, y: s.target.position.y + s.target.rescueRadius * 2 } },
    }));
    m = act(m, BLUE_NAV, { type: "SONAR_PING" });
    m = act(m, BLUE_NAV, { type: "RADIO_SCAN", sector: "B2" });
    m = act(m, BLUE_NAV, { type: "MARK_TARGET", position: { x: 0.4, y: 0.4 } });
    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.6, y: 0.6 } });
    const before = m.teams.blue.state;
    assert.ok(before.sonar.contacts.some((c) => c.kind === "gull"), "setup: ping caught the Gull");
    assert.equal(before.radio.readings.length, 1);

    m = V.step(editWorld(m, "blue", parkOnSurvivor), DT).match;
    const after = m.teams.blue.state;
    assert.equal(m.teams.blue.rescues, 1);
    assert.deepEqual(after.radio.readings, []);
    assert.equal(after.radio.lastScanAtMs, before.radio.lastScanAtMs, "scan cooldown still holds");
    assert.equal(after.radio.scansUsed, before.radio.scansUsed);
    assert.ok(!after.markers.some((mk) => mk.kind === "target_guess"));
    assert.deepEqual(
      after.markers.filter((mk) => mk.kind === "hazard"),
      before.markers.filter((mk) => mk.kind === "hazard"),
    );
    assert.ok(!after.sonar.contacts.some((c) => c.kind === "gull"));
    assert.deepEqual(
      after.sonar.contacts,
      before.sonar.contacts.filter((c) => c.kind !== "gull"),
      "hazard contacts kept",
    );
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "RADIO_SCAN", sector: "A1" }).rejected, "cooldown");
  });
});

describe("versus: wipeouts", () => {
  test("hull 0 respawns the boat at the start, once, and the world stays active", () => {
    let m = editWorld(active(), "blue", (s) => onReefWithHull(10)({ ...s, boat: { ...s.boat, throttle: 0.6, rudder: -0.3 } }));
    const expectedTarget = stepGame(m.teams.blue.state, DT).state.target;
    const r = stepEvents(m);
    m = r.match;
    assert.equal(count(r.events, "BOAT_WIPEOUT"), 1);
    assert.deepEqual(
      r.events.find((e) => e.type === "BOAT_WIPEOUT"),
      // TODO(dev1): expect cause "aground" for land once the land/jelly split lands.
      { type: "BOAT_WIPEOUT", team: "blue", atMs: m.elapsedMs, cause: "wrecked" },
    );
    assert.equal(count(r.events, "SURVIVOR_RESCUED"), 0);
    const blue = m.teams.blue;
    assert.deepEqual(blue.state.boat.position, MISSION.boatStart);
    assert.equal(blue.state.boat.heading, MISSION.boatStartHeading);
    assert.equal(blue.state.boat.speed, 0);
    assert.equal(blue.state.boat.hull, BOAT.startHull);
    assert.equal(blue.state.boat.throttle, 0.6, "throttle kept");
    assert.equal(blue.state.boat.rudder, -0.3, "rudder kept");
    assert.equal(blue.wipeouts, 1);
    assert.equal(blue.rescues, 0);
    assert.equal(blue.state.mission.phase, "active");
    assert.equal(blue.state.mission.failureReason, null);
    assert.equal(blue.state.mission.score, null);
    assert.deepEqual(blue.state.target, expectedTarget, "survivor unchanged");
    assert.equal(m.teams.red.wipeouts, 0);
    assert.equal(V.getScoreboard(m).scores.blue.wipeouts, 1);

    let more = 0;
    for (let i = 0; i < 30; i++) {
      const next = stepEvents(m);
      more += count(next.events, "BOAT_WIPEOUT");
      m = next.match;
    }
    assert.equal(more, 0, "no repeat wipeout");
    assert.equal(m.phase, "active");
  });

  test("hull 0 and the survivor in the same step: wipeout, no rescue", () => {
    const m = editWorld(active(), "blue", (s) => ({
      ...s,
      hazards: [{ id: "trap", kind: "reef", position: { ...s.target.position }, radius: 0.04, revealed: false, lastHitAtMs: null }],
      boat: { ...s.boat, position: { ...s.target.position }, hull: 20 },
    }));
    const r = V.step(m, DT);
    assert.equal(count(r.events, "BOAT_WIPEOUT"), 1);
    assert.equal(count(r.events, "SURVIVOR_RESCUED"), 0);
    assert.equal(r.match.teams.blue.rescues, 0);
    assert.equal(r.match.teams.blue.wipeouts, 1);
    assert.equal(r.match.teams.blue.state.mission.phase, "active");
  });

  test("repeated wipeouts never end the match early", () => {
    let m = active();
    for (let i = 1; i <= 4; i++) {
      m = V.step(editWorld(m, "red", onReefWithHull(5)), DT).match;
      assert.equal(m.teams.red.wipeouts, i);
      assert.equal(m.phase, "active");
    }
  });
});

describe("versus: timer, scoring and determinism", () => {
  test("a rescue on the final step counts and the match ends that step with the right winner", () => {
    let m = at(active(), VERSUS.matchDurationMs - DT / 2);
    m = editWorld(m, "blue", parkOnSurvivor);
    const r = V.step(m, DT);
    assert.equal(count(r.events, "SURVIVOR_RESCUED"), 1);
    assert.equal(count(r.events, "MATCH_ENDED"), 1);
    assert.equal(r.match.phase, "ended");
    assert.equal(r.match.teams.blue.rescues, 1);
    assert.equal(r.match.result?.winner, "blue");
    assert.equal(r.match.result?.scores.blue.rescues, 1);
    assert.equal(r.match.result?.endedAtMs, VERSUS.matchDurationMs);
    // Both worlds end in co-op terms too, so the results screen can reveal each team's survivor.
    for (const team of BOTH) {
      assert.equal(r.match.teams[team].state.mission.phase, "failure");
      assert.notEqual(V.getSpectatorView(r.match).teams[team].target, null);
    }
  });

  test("a wipeout on the final step still lets the match end normally", () => {
    const m = editWorld(at(active(), VERSUS.matchDurationMs - DT / 2), "red", onReefWithHull(5));
    const r = V.step(m, DT);
    assert.equal(count(r.events, "BOAT_WIPEOUT"), 1);
    assert.equal(r.match.phase, "ended");
    assert.equal(r.match.result?.scores.red.wipeouts, 1);
    assert.equal(r.match.result?.winner, null);
  });

  test("equal counts: whoever reached the total first wins", () => {
    let m = active();
    m = V.step(editWorld(m, "red", parkOnSurvivor), DT).match; // red 1
    m = run(m, 5);
    m = V.step(editWorld(m, "blue", parkOnSurvivor), DT).match; // blue 1, later
    m = run(m, 5);
    m = V.step(editWorld(m, "blue", parkOnSurvivor), DT).match; // blue 2
    m = run(m, 5);
    m = V.step(editWorld(m, "red", parkOnSurvivor), DT).match; // red 2, later
    assert.equal(V.getScoreboard(m).leader, "blue");
    const blueAt = m.teams.blue.lastRescueAtMs;
    const redAt = m.teams.red.lastRescueAtMs;
    assert.ok(blueAt !== null && redAt !== null && blueAt < redAt);

    m = at(m, VERSUS.matchDurationMs - DT / 2);
    m = editWorld(editWorld(m, "blue", openWater), "red", openWater);
    const end = V.step(m, DT).match;
    assert.deepEqual([end.result?.scores.blue.rescues, end.result?.scores.red.rescues], [2, 2]);
    assert.equal(end.result?.winner, "blue");
  });

  test("clocks stay equal to the match clock through rescues and wipeouts", () => {
    let m = active();
    for (let i = 0; i < 120; i++) {
      if (i % 20 === 5) m = editWorld(m, "blue", parkOnSurvivor);
      if (i % 30 === 10) m = editWorld(m, "red", onReefWithHull(5));
      m = V.step(m, DT).match;
      assertInvariants(m);
      assert.equal(m.teams.blue.state.mission.elapsedMs, m.teams.red.state.mission.elapsedMs);
    }
    assert.ok(m.teams.blue.rescues >= 5 && m.teams.red.wipeouts >= 3);
  });

  /** A whole scripted 120 s match: driving, sweeps, scans, pins, forced rescues and wipeouts. */
  function scriptedMatch(): { match: VersusMatchState; events: MatchEvent[] } {
    let m = active();
    const events: MatchEvent[] = [];
    const tryAct = (slot: PlayerTeamAssignment, action: PlayerAction) => {
      const r = V.applyAction(m, slot, action);
      m = r.match;
      events.push(...r.events);
    };
    for (let tick = 0; m.phase === "active"; tick++) {
      if (tick === 0) {
        tryAct(BLUE_CAPTAIN, { type: "SET_THROTTLE", throttle: 0.8 });
        tryAct(RED_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 });
      }
      if (tick % 45 === 0) {
        tryAct(BLUE_CAPTAIN, { type: "STEER", rudder: Math.sin(tick) * 0.7 });
        tryAct(RED_CAPTAIN, { type: "STEER", rudder: Math.cos(tick) * 0.5 });
      }
      if (tick % 100 === 0) tryAct(BLUE_NAV, { type: "SONAR_PING" });
      if (tick % 130 === 0) tryAct({ team: "red", role: "navigator" }, { type: "RADIO_SCAN", sector: "C3" });
      if (tick % 210 === 0) tryAct(BLUE_NAV, { type: "MARK_TARGET", position: { x: 0.3, y: 0.3 } });
      if (tick % 400 === 200) m = editWorld(m, "blue", parkOnSurvivor);
      if (tick % 550 === 300) m = editWorld(m, "red", parkOnSurvivor);
      if (tick % 900 === 450) m = editWorld(m, "red", onReefWithHull(5));
      const r = V.step(m, DT);
      m = r.match;
      events.push(...r.events);
      assertInvariants(m);
    }
    return { match: m, events };
  }

  test("a scripted full match run twice gives deep-equal final states and events", () => {
    const a = scriptedMatch();
    const b = scriptedMatch();
    assert.deepEqual(a.match, b.match);
    assert.deepEqual(a.events, b.events);
    assert.equal(a.match.phase, "ended");
    assert.equal(a.match.elapsedMs, VERSUS.matchDurationMs);
    assert.equal(count(a.events, "MATCH_ENDED"), 1);
    assert.equal(count(a.events, "SURVIVOR_RESCUED"), a.match.teams.blue.rescues + a.match.teams.red.rescues);
    assert.equal(count(a.events, "BOAT_WIPEOUT"), a.match.teams.blue.wipeouts + a.match.teams.red.wipeouts);
    assert.ok(a.match.teams.blue.rescues >= 3, `blue rescued ${a.match.teams.blue.rescues}`);
    assert.ok(a.match.teams.red.wipeouts >= 2, `red wiped out ${a.match.teams.red.wipeouts}`);
    assert.equal(a.match.result?.winner, decideWinner(a.match.result?.scores ?? V.getScoreboard(a.match).scores));
    assert.ok(!a.events.some((e) => e.type === "TEAM_GAME_EVENT" && e.event.type === "MISSION_ENDED"));
  });

  test("step never mutates its input across a rescue and a wipeout", () => {
    const m = editWorld(editWorld(active(), "blue", parkOnSurvivor), "red", onReefWithHull(5));
    const copy = structuredClone(m);
    const r = V.step(m, DT);
    assert.equal(count(r.events, "SURVIVOR_RESCUED") + count(r.events, "BOAT_WIPEOUT"), 2);
    assert.deepEqual(m, copy);
  });
});
