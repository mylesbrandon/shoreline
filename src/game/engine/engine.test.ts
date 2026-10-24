/**
 * Engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. The `todo` tests below are your FIRST TASK — see docs/TASKS.md.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createInitialState, getRoleViews, getSpectatorView, step } from "./index";
import { MISSION, NETWORK } from "../config";
import type { GameState } from "../types";

const DT = 1000 / NETWORK.simHz;
const fresh = (): GameState => createInitialState({ seed: 1, gameId: "test" });
const started = (): GameState => applyAction(fresh(), { type: "START_GAME" }, "host").state;

describe("initial state", () => {
  test("boat starts at the configured position, stopped, in briefing", () => {
    const s = fresh();
    assert.deepEqual(s.boat.position, MISSION.boatStart);
    assert.equal(s.boat.speed, 0);
    assert.equal(s.mission.phase, "briefing");
  });

  test("is deterministic for the same seed", () => {
    assert.deepEqual(fresh(), fresh());
  });
});

describe("action validation", () => {
  test("only the host can start the game", () => {
    assert.equal(applyAction(fresh(), { type: "START_GAME" }, "captain").rejected, "not_permitted");
    assert.equal(started().mission.phase, "active");
  });

  test("role permissions are enforced", () => {
    const r = applyAction(started(), { type: "STEER", rudder: 0.5 }, "sonar");
    assert.equal(r.rejected, "not_permitted");
  });

  test("gameplay actions are rejected outside the active phase", () => {
    assert.equal(applyAction(fresh(), { type: "STEER", rudder: 0.5 }, "captain").rejected, "wrong_phase");
  });

  test("out-of-range payloads are rejected", () => {
    assert.equal(applyAction(started(), { type: "STEER", rudder: 3 }, "captain").rejected, "invalid_payload");
    assert.equal(applyAction(started(), { type: "SET_THROTTLE", throttle: Number.NaN }, "captain").rejected, "invalid_payload");
  });

  test("applyAction never mutates its input", () => {
    const s = started();
    const snapshot = structuredClone(s);
    applyAction(s, { type: "SET_THROTTLE", throttle: 1 }, "captain");
    assert.deepEqual(s, snapshot);
  });
});

describe("step", () => {
  test("does nothing before the mission starts", () => {
    const s = fresh();
    assert.equal(step(s, DT).state, s);
  });

  test("advances the clock and tick while active", () => {
    const r = step(started(), DT);
    assert.equal(r.state.tick, 1);
    assert.ok(Math.abs(r.state.mission.elapsedMs - DT) < 1e-9);
  });

  test("times out into failure", () => {
    let s = started();
    s = { ...s, mission: { ...s.mission, elapsedMs: s.mission.durationMs - 1 } };
    const r = step(s, DT);
    assert.equal(r.state.mission.phase, "failure");
    assert.equal(r.state.mission.failureReason, "timeout");
    assert.ok(r.events.some((e) => e.type === "MISSION_ENDED"));
  });

  // ---- Developer 1 FIRST TASK: replace these todos with real tests ----
  test.todo("STEER and SET_THROTTLE are stored on the boat");
  test.todo("boat moves north when heading 0 with throttle > 0 after N steps");
  test.todo("positive rudder turns the boat clockwise (heading increases)");
  test.todo("boat cannot leave the map (clamped to MAP.edgePadding)");
  test.todo("same actions + same dt sequence => identical state (determinism)");
});

describe("hidden information", () => {
  test("no player view contains the rescue target", () => {
    const views = getRoleViews(started());
    for (const view of Object.values(views)) {
      assert.ok(!("target" in view), `${view.role} view leaks target`);
      assert.ok(!JSON.stringify(view).includes('"rescueRadius"'), `${view.role} view leaks target radius`);
    }
  });

  test("only the weather view contains the forecast", () => {
    const views = getRoleViews(started());
    assert.ok("weather" in views.weather);
    for (const role of ["captain", "sonar", "radio"] as const) {
      assert.ok(!JSON.stringify(views[role]).includes('"forecast"'), `${role} view leaks forecast`);
    }
  });

  test("captain does not see far-away unrevealed hazards", () => {
    const captain = getRoleViews(started()).captain;
    assert.ok(captain.visibleHazards.every((h) => h.revealed || Math.hypot(h.position.x - 0.5, h.position.y - 0.9) < 0.3));
  });

  test("spectator sees the target only after the mission ends", () => {
    const s = started();
    assert.equal(getSpectatorView(s).target, null);
    const ended: GameState = { ...s, mission: { ...s.mission, phase: "victory" } };
    assert.deepEqual(getSpectatorView(ended).target, s.target);
  });
});
