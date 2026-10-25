/**
 * Contract tests for the shared 2v2 rules that are pure data (winner rule, seats, permissions)
 * and for the mock fixtures UI developers build against. Run: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { decideWinner, SLOT_ORDER, TEAMS, VERSUS, VERSUS_ACTION_PERMISSIONS, versusRoleMay, type TeamScore } from "./contract";
import { MOCK_MATCH_CYCLE_MS, mockScoreboardAt, mockSpectatorMatchViewAt, mockVersusViewsAt } from "./mock";

const score = (team: TeamScore["team"], rescues: number, lastRescueAtMs: number | null): TeamScore => ({
  team,
  rescues,
  wipeouts: 0,
  hull: 100,
  lastRescueAtMs,
});

describe("decideWinner", () => {
  test("more rescues wins", () => {
    assert.equal(decideWinner({ blue: score("blue", 3, 90_000), red: score("red", 2, 10_000) }), "blue");
    assert.equal(decideWinner({ blue: score("blue", 0, null), red: score("red", 1, 50_000) }), "red");
  });
  test("equal rescues: whoever got there first wins", () => {
    assert.equal(decideWinner({ blue: score("blue", 2, 70_000), red: score("red", 2, 65_000) }), "red");
  });
  test("ties", () => {
    assert.equal(decideWinner({ blue: score("blue", 0, null), red: score("red", 0, null) }), null);
    assert.equal(decideWinner({ blue: score("blue", 1, 40_000), red: score("red", 1, 40_000) }), null);
  });
});

describe("seats and permissions", () => {
  test("SLOT_ORDER is four distinct seats: one captain and one navigator per team", () => {
    assert.equal(new Set(SLOT_ORDER.map((s) => `${s.team}:${s.role}`)).size, 4);
    for (const team of TEAMS) {
      assert.deepEqual(SLOT_ORDER.filter((s) => s.team === team).map((s) => s.role).sort(), ["captain", "navigator"]);
    }
    assert.deepEqual(SLOT_ORDER.slice(0, 2).map((s) => s.role), ["captain", "captain"], "two phones = two boats");
  });
  test("captain and navigator actions don't overlap; host actions belong to nobody", () => {
    const { captain, navigator } = VERSUS_ACTION_PERMISSIONS;
    assert.ok(captain.every((t) => !navigator.includes(t)));
    assert.equal(versusRoleMay("navigator", "SONAR_PING"), true);
    assert.equal(versusRoleMay("captain", "RADIO_SCAN"), false);
    assert.equal(versusRoleMay("captain", "START_GAME"), false);
    assert.equal(versusRoleMay("navigator", "WEATHER_SHIELD"), false);
  });
});

describe("mock fixtures", () => {
  test("the scripted cycle runs countdown → active → ended", () => {
    assert.equal(mockScoreboardAt(0).phase, "countdown");
    assert.equal(mockScoreboardAt(VERSUS.countdownMs + 1_000).phase, "active");
    const end = mockScoreboardAt(MOCK_MATCH_CYCLE_MS - 1);
    assert.equal(end.phase, "ended");
    assert.ok(end.result);
    assert.equal(end.result.winner, decideWinner(end.result.scores));
  });
  test("views and spectator agree on tick, match and scores", () => {
    const t = VERSUS.countdownMs + 60_000;
    const views = mockVersusViewsAt(t);
    const spectator = mockSpectatorMatchViewAt(t);
    assert.equal(views.red.navigator.team, "red");
    assert.equal(views.blue.captain.tick, spectator.tick);
    assert.deepEqual(spectator.scoreboard, mockScoreboardAt(t));
    assert.ok(spectator.recentRescues.every((r) => r.atMs <= spectator.scoreboard.elapsedMs));
  });
});
