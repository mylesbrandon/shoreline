/**
 * 2v2 match engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. These pin the versus-1 contract behaviour; they must keep passing once
 * survivors respawn and wipeouts replace the baseline adapter's frozen worlds.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState, getCaptainView, step as stepGame, versusEngine as V } from "./index";
import { dockFor, VERSUS_RULES, versusSignalStrength } from "./versus";
import { SURVIVORS, survivorSpawn } from "./survivors";
import { BOAT, CAPTAIN, MISSION, NETWORK, TARGET } from "../config";
import {
  decideWinner,
  VERSUS,
  type MatchEvent,
  type PlayerTeamAssignment,
  type TeamId,
  type VersusMatchState,
} from "../versus/contract";
import type { GameState, HazardKind, PlayerAction, Vec2 } from "../types";
import { ALL_SECTORS } from "../sectors";

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

/** Turn the first hazard into `kind` and put the boat inside it with `hull` left, so the next step hits it. */
const onHazardWithHull =
  (kind: HazardKind, hull: number) =>
  (s: GameState): GameState => {
    const h = s.hazards[0];
    assert.ok(h, "layout has a hazard");
    return {
      ...s,
      hazards: s.hazards.map((x) => (x.id === h.id ? { ...x, kind, lastHitAtMs: null } : x)),
      boat: { ...s.boat, position: { ...h.position }, hull },
    };
  };

/** On a jellyfish bloom (the only hull damage in versus) with `hull` left: ≤ 25 wrecks the boat. */
const onJellyWithHull = (hull: number) => onHazardWithHull("debris", hull);

function stepEvents(m: VersusMatchState): { match: VersusMatchState; events: MatchEvent[] } {
  return V.step(m, DT);
}

const count = (events: MatchEvent[], type: MatchEvent["type"]) => events.filter((e) => e.type === type).length;

function assertInvariants(m: VersusMatchState) {
  for (const team of BOTH) {
    const w = m.teams[team];
    assert.equal(w.rescues, w.rescueLog.length, `${team}: rescues === rescueLog.length`);
    if (m.phase === "active") assert.equal(w.state.mission.elapsedMs, m.elapsedMs, `${team}: clock`);
  }
  // One shared survivor sequence: every index 0..n-1 was rescued exactly once, by one crew.
  const indices = BOTH.flatMap((team) => m.teams[team].rescueLog.map((r) => r.survivorIndex)).sort((a, b) => a - b);
  assert.deepEqual(indices, indices.map((_, i) => i), "survivor indices are 0..n-1 across both crews");
  assert.deepEqual(m.teams.blue.state.target, m.teams.red.state.target, "both crews chase the same survivor");
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

  test("the next survivor spawns valid and away from both boats", () => {
    const m = V.step(editWorld(active(), "blue", parkOnSurvivor), DT).match;
    const s = m.teams.blue.state;
    const boats = [s.boat.position, m.teams.red.state.boat.position];
    assert.deepEqual(s.target.position, survivorSpawn(m.seed, 1, s.hazards, boats, s.target.rescueRadius));
    for (const b of boats) {
      assert.ok(Math.hypot(s.target.position.x - b.x, s.target.position.y - b.y) >= SURVIVORS.minSpawnFromBoat);
    }
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

  test("both boats on the survivor in the same step: one rescue only, both chase the next one", () => {
    let m = active();
    for (let i = 1; i <= 5; i++) {
      const r = V.step(editWorld(editWorld(m, "blue", parkOnSurvivor), "red", parkOnSurvivor), DT);
      m = r.match;
      assert.equal(count(r.events, "SURVIVOR_RESCUED"), 1, `race ${i}: one rescue`);
      assert.equal(m.teams.blue.rescues + m.teams.red.rescues, i);
      assert.equal(m.teams.blue.state.mission.phase, "active");
      assert.equal(m.teams.red.state.mission.phase, "active");
      assertInvariants(m);
    }
    // Exact ties go to the crew with fewer rescues, so a dead heat alternates.
    assert.deepEqual([m.teams.blue.rescues, m.teams.red.rescues], [3, 2]);
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
  test("jellyfish taking the hull to 0 wreck the boat: back at the start, once, world stays active", () => {
    let m = editWorld(active(), "blue", (s) => onJellyWithHull(10)({ ...s, boat: { ...s.boat, throttle: 0.6, rudder: -0.3 } }));
    const expectedTarget = stepGame(m.teams.blue.state, DT).state.target;
    const r = stepEvents(m);
    m = r.match;
    assert.equal(count(r.events, "BOAT_WIPEOUT"), 1);
    assert.deepEqual(
      r.events.find((e) => e.type === "BOAT_WIPEOUT"),
      { type: "BOAT_WIPEOUT", team: "blue", atMs: m.elapsedMs, cause: "wrecked" },
    );
    assert.equal(count(r.events, "SURVIVOR_RESCUED"), 0);
    const blue = m.teams.blue;
    assert.deepEqual(blue.state.boat.position, dockFor("blue"));
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
      hazards: [{ id: "trap", kind: "debris", position: { ...s.target.position }, radius: 0.04, revealed: false, lastHitAtMs: null }],
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
      m = V.step(editWorld(m, "red", onJellyWithHull(5)), DT).match;
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
    const m = editWorld(at(active(), VERSUS.matchDurationMs - DT / 2), "red", onJellyWithHull(5));
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
      if (i % 30 === 10) m = editWorld(m, "red", onJellyWithHull(5));
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
      if (tick % 900 === 450) m = editWorld(m, "red", onJellyWithHull(5));
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
    const m = editWorld(editWorld(active(), "blue", parkOnSurvivor), "red", onJellyWithHull(5));
    const copy = structuredClone(m);
    const r = V.step(m, DT);
    assert.equal(count(r.events, "SURVIVOR_RESCUED") + count(r.events, "BOAT_WIPEOUT"), 2);
    assert.deepEqual(m, copy);
  });
});

// ---------------------------------------------------------------------------
// Playtest round 2 (contract versus-2): land vs jellyfish, speed, pickup, the Driver's view
// ---------------------------------------------------------------------------

const hullHits = (events: MatchEvent[]) =>
  events.flatMap((e) => (e.type === "TEAM_GAME_EVENT" && e.event.type === "HAZARD_HIT" ? [e.event] : []));

describe("versus: land runs you aground, only jellyfish hurt", () => {
  for (const kind of ["reef", "rock"] as const) {
    test(`touching ${kind === "reef" ? "a sandbar" : "rocks"} runs aground: back at the dock, repaired`, () => {
      let m = editWorld(active(), "blue", (s) => onHazardWithHull(kind, 60)({ ...s, boat: { ...s.boat, throttle: 1, rudder: 0.4 } }));
      const r = stepEvents(m);
      m = r.match;
      assert.deepEqual(
        r.events.filter((e) => e.type === "BOAT_WIPEOUT"),
        [{ type: "BOAT_WIPEOUT", team: "blue", atMs: m.elapsedMs, cause: "aground" }],
      );
      const blue = m.teams.blue;
      assert.equal(blue.state.boat.hull, BOAT.startHull, "back at the dock with a full hull");
      assert.deepEqual(blue.state.boat.position, dockFor("blue"));
      assert.equal(blue.state.boat.speed, 0);
      assert.deepEqual([blue.state.boat.throttle, blue.state.boat.rudder], [1, 0.4]);
      assert.equal(blue.wipeouts, 1);
      assert.equal(blue.state.mission.phase, "active");
      assert.deepEqual(hullHits(r.events).map((h) => h.damage), [0], "the hit is reported with no damage");
      assert.equal(V.getScoreboard(m).scores.blue.hull, BOAT.startHull);
    });
  }

  test("land with a low hull still counts as aground (not wrecked), and comes back repaired", () => {
    const r = V.step(editWorld(active(), "red", onHazardWithHull("rock", 10)), DT);
    const wipeout = r.events.find((e) => e.type === "BOAT_WIPEOUT");
    assert.ok(wipeout?.type === "BOAT_WIPEOUT" && wipeout.cause === "aground");
    assert.equal(r.match.teams.red.state.boat.hull, BOAT.startHull);
  });

  test("a jellyfish sting costs hull but the boat keeps going", () => {
    const m = editWorld(active(), "blue", onJellyWithHull(60));
    const before = m.teams.blue.state.boat.position;
    const r = V.step(m, DT);
    assert.equal(count(r.events, "BOAT_WIPEOUT"), 0);
    assert.deepEqual(hullHits(r.events).map((h) => h.damage), [BOAT.collisionDamage]);
    const blue = r.match.teams.blue;
    assert.equal(blue.state.boat.hull, 60 - BOAT.collisionDamage);
    assert.ok(Math.hypot(blue.state.boat.position.x - before.x, blue.state.boat.position.y - before.y) < 0.01, "not respawned");
    assert.equal(blue.wipeouts, 0);
  });

  test("land and a wrecking sting in the same step: wrecked, full hull", () => {
    const m = editWorld(active(), "blue", (s) => {
      const placed = onJellyWithHull(20)(s);
      const at = placed.boat.position;
      return {
        ...placed,
        hazards: [
          { id: "jelly", kind: "debris", position: { ...at }, radius: 0.04, revealed: false, lastHitAtMs: null },
          { id: "bar", kind: "reef", position: { ...at }, radius: 0.04, revealed: false, lastHitAtMs: null },
        ],
      };
    });
    const r = V.step(m, DT);
    const wipeouts = r.events.filter((e) => e.type === "BOAT_WIPEOUT");
    assert.equal(wipeouts.length, 1);
    assert.ok(wipeouts[0]?.type === "BOAT_WIPEOUT" && wipeouts[0].cause === "wrecked");
    assert.equal(r.match.teams.blue.state.boat.hull, BOAT.startHull);
  });

  test("land beside the survivor: aground, no rescue", () => {
    const m = editWorld(active(), "blue", (s) => ({
      ...s,
      hazards: [{ id: "bar", kind: "reef", position: { ...s.target.position }, radius: 0.04, revealed: false, lastHitAtMs: null }],
      boat: { ...s.boat, position: { ...s.target.position } },
    }));
    const r = V.step(m, DT);
    assert.equal(count(r.events, "SURVIVOR_RESCUED"), 0);
    assert.equal(r.match.teams.blue.rescues, 0);
    assert.equal(r.match.teams.blue.wipeouts, 1);
  });
});

describe("versus: speed and pickup", () => {
  test(`boats reach ${VERSUS_RULES.boatSpeedFactor}× co-op top speed`, () => {
    let m = editWorld(editWorld(active(), "blue", openWater), "red", openWater);
    m = act(m, BLUE_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 });
    m = run(m, 150);
    assert.equal(m.teams.blue.state.boat.speed, BOAT.maxSpeed * VERSUS_RULES.boatSpeedFactor);
  });

  test("co-op step without tuning is unchanged", () => {
    const s0 = openWater(active().teams.blue.state);
    let s: GameState = { ...s0, boat: { ...s0.boat, throttle: 1 } };
    for (let i = 0; i < 150; i++) s = stepGame(s, DT).state;
    assert.equal(s.boat.speed, BOAT.maxSpeed);
  });

  test("the pickup radius is wider in versus, and identical for both teams", () => {
    const m = fresh();
    assert.equal(m.teams.blue.state.target.rescueRadius, VERSUS_RULES.rescueRadius);
    assert.ok(VERSUS_RULES.rescueRadius > TARGET.rescueRadius);
    assert.deepEqual(m.teams.blue.state.target, m.teams.red.state.target);
  });

  test("a boat that stops just inside the wider radius picks the person up", () => {
    const m = editWorld(active(), "blue", (s) => ({
      ...s,
      boat: { ...s.boat, position: { x: s.target.position.x, y: s.target.position.y + VERSUS_RULES.rescueRadius * 0.9 } },
    }));
    assert.equal(V.step(m, DT).match.teams.blue.rescues, 1);
  });
});

describe("versus: the Driver sees less, but sees the person up close", () => {
  /** Put the boat `d` south of the survivor (no hazards, calm water). */
  const southOfSurvivor = (d: number) => (s: GameState): GameState => {
    const w = openWater(s);
    const target = { position: { x: 0.5, y: 0.4 }, rescueRadius: VERSUS_RULES.rescueRadius };
    return { ...w, target, boat: { ...w.boat, position: { x: 0.5, y: 0.4 + d } } };
  };

  test("survivor is null until their rescue ring reaches the lookout circle", () => {
    const edge = VERSUS.captainVisualRange + VERSUS_RULES.rescueRadius;
    const far = V.getViews(editWorld(active(), "blue", southOfSurvivor(edge + 0.01)));
    assert.equal(far.blue.captain.survivor, null);
    const near = V.getViews(editWorld(active(), "blue", southOfSurvivor(edge - 0.01)));
    assert.deepEqual(near.blue.captain.survivor, { x: 0.5, y: 0.4 });
    assert.equal(near.red.captain.survivor, null, "red's own survivor is far from red's boat");
    assert.ok(edge - 0.01 > VERSUS_RULES.rescueRadius, "visible before the pickup happens");
    assert.ok(!("target" in near.blue.captain.captain), "the co-op CaptainView still hides target");
    assert.ok(!("survivor" in near.blue.navigator), "the Navigator gets no survivor field");
  });

  test("lookout is smaller than co-op: a hazard co-op would show stays hidden", () => {
    const d = (VERSUS.captainVisualRange + CAPTAIN.visualRange) / 2;
    const m = editWorld(active(), "blue", (s) => ({
      ...openWater(s),
      hazards: [{ id: "h", kind: "reef", position: { x: 0.5, y: 0.5 - d }, radius: 0.0001, revealed: false, lastHitAtMs: null }],
      boat: { ...s.boat, position: { x: 0.5, y: 0.5 } },
    }));
    const state = m.teams.blue.state;
    assert.equal(getCaptainView(state).visibleHazards.length, 1, "co-op lookout sees it");
    assert.equal(V.getViews(m).blue.captain.captain.visibleHazards.length, 0, "versus lookout doesn't");
  });

  test("drone contacts show on the Driver's screen for 3 s, not 5 s", () => {
    let m = editWorld(active(), "blue", (s) => ({
      ...openWater(s),
      hazards: [{ id: "far", kind: "rock", position: { x: 0.5, y: 0.6 }, radius: 0.03, revealed: false, lastHitAtMs: null }],
      boat: { ...s.boat, position: { x: 0.5, y: 0.8 } },
    }));
    m = act(m, BLUE_NAV, { type: "SONAR_PING" });
    assert.equal(V.getViews(m).blue.captain.captain.visibleHazards.length, 1);
    m = at(m, m.elapsedMs + VERSUS_RULES.captainSonarRevealMs - 100);
    assert.equal(V.getViews(m).blue.captain.captain.visibleHazards.length, 1);
    m = at(m, m.elapsedMs + 200);
    assert.equal(V.getViews(m).blue.captain.captain.visibleHazards.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Playtest round 3 (contract versus-3): one shared ocean, one survivor, a race
// ---------------------------------------------------------------------------

describe("versus: both crews race for the same survivor", () => {
  test("blue's rescue moves the survivor for red too and clears red's tracking", () => {
    let m = active();
    // Red has been tracking the survivor: a scan, a pin and (close by) a drone contact.
    m = editWorld(m, "red", (s) => ({
      ...s,
      boat: { ...s.boat, position: { x: s.target.position.x, y: s.target.position.y + s.target.rescueRadius * 2 } },
    }));
    m = act(m, { team: "red", role: "navigator" }, { type: "SONAR_PING" });
    m = act(m, { team: "red", role: "navigator" }, { type: "RADIO_SCAN", sector: "B2" });
    m = act(m, { team: "red", role: "navigator" }, { type: "MARK_TARGET", position: { x: 0.3, y: 0.3 } });
    m = act(m, { team: "red", role: "navigator" }, { type: "MARK_HAZARD", position: { x: 0.6, y: 0.6 } });
    assert.ok(m.teams.red.state.sonar.contacts.some((c) => c.kind === "gull"), "setup: red's drone saw the person");
    const old = m.teams.blue.state.target.position;

    const r = V.step(editWorld(m, "blue", parkOnSurvivor), DT);
    m = r.match;
    const rescued = r.events.filter((e) => e.type === "SURVIVOR_RESCUED");
    assert.equal(rescued.length, 1);
    assert.ok(rescued[0]?.type === "SURVIVOR_RESCUED" && rescued[0].rescue.team === "blue");
    assert.deepEqual([m.teams.blue.rescues, m.teams.red.rescues], [1, 0]);

    const red = m.teams.red.state;
    assert.deepEqual(red.target, m.teams.blue.state.target, "red now chases blue's next survivor");
    assert.notDeepEqual(red.target.position, old);
    assert.deepEqual(red.radio.readings, []);
    assert.ok(!red.markers.some((mk) => mk.kind === "target_guess"));
    assert.ok(red.markers.some((mk) => mk.kind === "hazard"), "red's hazard marks stay");
    assert.ok(!red.sonar.contacts.some((c) => c.kind === "gull"));
    assert.equal(red.mission.phase, "active");
    assertInvariants(m);
  });

  test("both reach the survivor in the same step: the closer boat scores", () => {
    const m = editWorld(editWorld(active(), "blue", (s) => ({
      ...s,
      boat: { ...s.boat, position: { x: s.target.position.x, y: s.target.position.y + VERSUS_RULES.rescueRadius * 0.8 } },
    })), "red", parkOnSurvivor);
    const r = V.step(m, DT);
    const rescued = r.events.filter((e) => e.type === "SURVIVOR_RESCUED");
    assert.equal(rescued.length, 1);
    assert.ok(rescued[0]?.type === "SURVIVOR_RESCUED" && rescued[0].rescue.team === "red");
    assert.deepEqual([r.match.teams.blue.rescues, r.match.teams.red.rescues], [0, 1]);
    assert.equal(r.match.teams.blue.state.mission.phase, "active", "the loser keeps racing");
  });

  test("survivor indices are shared: 0, 1, 2 across both crews", () => {
    let m = active();
    m = V.step(editWorld(m, "red", parkOnSurvivor), DT).match;
    m = V.step(editWorld(m, "blue", parkOnSurvivor), DT).match;
    m = V.step(editWorld(m, "blue", parkOnSurvivor), DT).match;
    assert.deepEqual(m.teams.red.rescueLog.map((r) => r.survivorIndex), [0]);
    assert.deepEqual(m.teams.blue.rescueLog.map((r) => r.survivorIndex), [1, 2]);
    assertInvariants(m);
  });

  test("the survivor stays identical in both worlds while it drifts", () => {
    let m = editWorld(editWorld(active(), "blue", openWaterKeepTarget), "red", openWaterKeepTarget);
    m = act(m, BLUE_CAPTAIN, { type: "SET_THROTTLE", throttle: 1 });
    for (let i = 0; i < 300; i++) {
      m = V.step(m, DT).match;
      assert.deepEqual(m.teams.blue.state.target, m.teams.red.state.target);
    }
  });
});

/** Like openWater, but keeps the real survivor (so it drifts with the current). */
function openWaterKeepTarget(s: GameState): GameState {
  return { ...s, hazards: [] };
}

describe("versus: docks and the rival boat", () => {
  test("each crew starts at its own dock berth, side by side", () => {
    const m = fresh();
    assert.deepEqual(m.teams.blue.state.boat.position, dockFor("blue"));
    assert.deepEqual(m.teams.red.state.boat.position, dockFor("red"));
    assert.ok(dockFor("blue").x < MISSION.boatStart.x && dockFor("red").x > MISSION.boatStart.x);
    assert.equal(dockFor("blue").y, MISSION.boatStart.y);
  });

  test("a wipeout sends the crew back to its own berth", () => {
    const m = V.step(editWorld(active(), "red", onJellyWithHull(5)), DT).match;
    assert.deepEqual(m.teams.red.state.boat.position, dockFor("red"));
  });

  test("the Navigator always sees the rival boat; the Driver only inside the window", () => {
    const place = (blue: Vec2, red: Vec2) =>
      editWorld(
        editWorld(active(), "blue", (s) => ({ ...s, boat: { ...s.boat, position: blue } })),
        "red",
        (s) => ({ ...s, boat: { ...s.boat, position: red } }),
      );
    const half = VERSUS.captainWindowSpan / 2;

    const far = V.getViews(place({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }));
    assert.deepEqual(far.blue.navigator.rival, { x: 0.7, y: 0.5 });
    assert.deepEqual(far.red.navigator.rival, { x: 0.3, y: 0.5 });
    assert.equal(far.blue.captain.rival, null);
    assert.equal(far.red.captain.rival, null);

    const near = V.getViews(place({ x: 0.5, y: 0.5 }, { x: 0.5 + half * 0.9, y: 0.5 - half * 0.9 }));
    assert.deepEqual(near.blue.captain.rival, { x: 0.5 + half * 0.9, y: 0.5 - half * 0.9 });
    assert.deepEqual(near.red.captain.rival, { x: 0.5, y: 0.5 });

    const edge = V.getViews(place({ x: 0.5, y: 0.5 }, { x: 0.5 + half * 1.1, y: 0.5 }));
    assert.equal(edge.blue.captain.rival, null, "just outside the window on one axis");
  });
});

describe("versus: weaker currents", () => {
  test(`base current and every gust are ${VERSUS_RULES.currentFactor}× the seeded co-op weather`, () => {
    const coop = createInitialState({ seed: 7, gameId: "g" }).weather;
    const versus = fresh().teams.blue.state.weather;
    const scaled = (v: Vec2) => ({ x: v.x * VERSUS_RULES.currentFactor, y: v.y * VERSUS_RULES.currentFactor });
    assert.deepEqual(versus.current, scaled(coop.current));
    assert.equal(versus.forecast.length, coop.forecast.length);
    versus.forecast.forEach((entry, i) => {
      assert.equal(entry.atMs, coop.forecast[i]?.atMs);
      assert.deepEqual(entry.current, scaled(coop.forecast[i]?.current ?? { x: NaN, y: NaN }));
    });
    assert.deepEqual(fresh().teams.red.state.weather, versus, "identical for both crews");
  });
});

// ---------------------------------------------------------------------------
// Playtest round 6: two hazard marks per crew, radio levels, reef formations
// ---------------------------------------------------------------------------

const RED_NAV: PlayerTeamAssignment = { team: "red", role: "navigator" };
const hazardMarks = (m: VersusMatchState, team: TeamId) => m.teams[team].state.markers.filter((mk) => mk.kind === "hazard");

describe("versus: two hazard marks per crew", () => {
  test("place two, the third is refused, removing one frees a slot, the replacement shows", () => {
    let m = act(active(), BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.3, y: 0.3 } });
    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.6, y: 0.3 } });
    assert.equal(hazardMarks(m, "blue").length, VERSUS.maxHazardMarks);

    const third = V.applyAction(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.5, y: 0.6 } });
    assert.equal(third.rejected, "invalid_payload");
    assert.equal(third.match, m, "refused: unchanged");

    // Tap (close to) the first mark: it is removed, and the Captain's view loses it too.
    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.3 + VERSUS.markRemoveRadius * 0.5, y: 0.3 } });
    assert.deepEqual(hazardMarks(m, "blue").map((mk) => mk.position), [{ x: 0.6, y: 0.3 }]);
    assert.deepEqual(V.getViews(m).blue.captain.captain.markers.filter((mk) => mk.kind === "hazard").map((mk) => mk.position), [{ x: 0.6, y: 0.3 }]);

    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.5, y: 0.6 } });
    assert.equal(hazardMarks(m, "blue").length, 2);
    assert.ok(V.getViews(m).blue.captain.captain.markers.some((mk) => mk.kind === "hazard" && mk.position.x === 0.5 && mk.position.y === 0.6));
  });

  test("a stream of marks never goes past the cap", () => {
    let m = active();
    for (let i = 0; i < 12; i++) {
      m = V.applyAction(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.1 + i * 0.07, y: 0.5 } }).match;
      assert.ok(hazardMarks(m, "blue").length <= VERSUS.maxHazardMarks);
    }
    assert.equal(hazardMarks(m, "blue").length, VERSUS.maxHazardMarks);
  });

  test("the cap is per crew", () => {
    let m = act(active(), BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.3, y: 0.3 } });
    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.6, y: 0.3 } });
    m = act(m, RED_NAV, { type: "MARK_HAZARD", position: { x: 0.3, y: 0.3 } });
    m = act(m, RED_NAV, { type: "MARK_HAZARD", position: { x: 0.7, y: 0.7 } });
    assert.deepEqual([hazardMarks(m, "blue").length, hazardMarks(m, "red").length], [2, 2]);
  });

  test("radio pins don't use a slot, and a hazard tap never removes the pin", () => {
    let m = act(active(), BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.3, y: 0.3 } });
    m = act(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.6, y: 0.3 } });
    m = act(m, BLUE_NAV, { type: "MARK_TARGET", position: { x: 0.5, y: 0.5 } });
    m = act(m, BLUE_NAV, { type: "MARK_TARGET", position: { x: 0.4, y: 0.4 } });
    const pins = () => m.teams.blue.state.markers.filter((mk) => mk.kind === "target_guess");
    assert.deepEqual(pins().map((p) => p.position), [{ x: 0.4, y: 0.4 }], "the pin still moves like before");
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: 0.4, y: 0.4 } }).rejected, "invalid_payload");
    assert.equal(pins().length, 1);
    assert.equal(hazardMarks(m, "blue").length, 2);
  });

  test("bad payloads are still refused; a new match starts with no marks", () => {
    const m = active();
    assert.equal(V.applyAction(m, BLUE_NAV, { type: "MARK_HAZARD", position: { x: Number.NaN, y: 0.3 } }).rejected, "invalid_payload");
    assert.equal(fresh().teams.blue.state.markers.length, 0);
  });
});

describe("versus: radio signal levels across the board", () => {
  test("3 bars in the person's square, then 2 / 1 / 0 rings, with most of the board lit", () => {
    const target = { x: 0.375, y: 0.375 }; // centre of B2
    const levels = ALL_SECTORS.map((s) => versusSignalStrength(target, s));
    assert.equal(versusSignalStrength(target, "B2"), 1);
    assert.ok(levels.every((l) => [0, 0.33, 0.67, 1].includes(l)));
    assert.equal(versusSignalStrength(target, "A1"), 0.67, "diagonal neighbour: 2 bars");
    assert.equal(versusSignalStrength(target, "D2"), 0.33, "two squares away: 1 bar");
    assert.equal(versusSignalStrength(target, "D4"), 0.33);
    assert.ok(levels.filter((l) => l > 0).length >= 14, `${levels.filter((l) => l > 0).length} of 16 squares read something`);
  });

  test("a scan in versus reports the level for that square", () => {
    let m = editWorld(active(), "blue", (s) => ({ ...s, target: { ...s.target, position: { x: 0.375, y: 0.375 } } }));
    const r = V.applyAction(m, BLUE_NAV, { type: "RADIO_SCAN", sector: "D2" });
    m = r.match;
    assert.equal(r.rejected, null);
    assert.equal(m.teams.blue.state.radio.readings[0]?.strength, 0.33);
    assert.ok(r.events.some((e) => e.type === "TEAM_GAME_EVENT" && e.event.type === "RADIO_SCANNED" && e.event.strength === 0.33));
  });
});
