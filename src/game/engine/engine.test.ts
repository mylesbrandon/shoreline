/**
 * Engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. The `todo` tests below are your FIRST TASK — see docs/TASKS.md.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createInitialState, getRoleViews, getSpectatorView, step } from "./index";
import { BOAT, MAP, MISSION, NETWORK } from "../config";
import type { GameState, PlayerAction } from "../types";

const DT = 1000 / NETWORK.simHz;
const fresh = (): GameState => createInitialState({ seed: 1, gameId: "test" });
const started = (): GameState => applyAction(fresh(), { type: "START_GAME" }, "host").state;

/** Apply a captain action, failing the test if the engine rejects it. */
function captain(state: GameState, action: PlayerAction): GameState {
  const r = applyAction(state, action, "captain");
  assert.equal(r.rejected, null, `${action.type} was rejected: ${r.rejected}`);
  return r.state;
}

/** Apply captain actions, then run `steps` fixed simulation steps of DT ms. */
function drive(state: GameState, actions: PlayerAction[], steps: number): GameState {
  let s = actions.reduce(captain, state);
  for (let i = 0; i < steps; i++) s = step(s, DT).state;
  return s;
}

/** Signed shortest difference b - a in (-π, π]. */
function angleDelta(a: number, b: number): number {
  const d = (((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
}

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

  test("STEER and SET_THROTTLE are stored on the boat", () => {
    let s = captain(started(), { type: "STEER", rudder: -0.4 });
    s = captain(s, { type: "SET_THROTTLE", throttle: 0.7 });
    assert.equal(s.boat.rudder, -0.4);
    assert.equal(s.boat.throttle, 0.7);
    // Stored only — nothing moves until step().
    assert.deepEqual(s.boat.position, MISSION.boatStart);
    assert.equal(s.boat.speed, 0);
  });

  test("boat moves north when heading 0 with full throttle", () => {
    const s = drive(started(), [{ type: "SET_THROTTLE", throttle: 1 }], 60);
    assert.ok(s.boat.position.y < MISSION.boatStart.y, `y should decrease, got ${s.boat.position.y}`);
    assert.ok(Math.abs(s.boat.position.x - MISSION.boatStart.x) < 1e-9, `x drifted to ${s.boat.position.x}`);
    assert.equal(s.boat.heading, 0);
    assert.ok(s.boat.speed > 0 && s.boat.speed <= BOAT.maxSpeed);
  });

  test("speed eases toward throttle * maxSpeed without overshooting", () => {
    let s = captain(started(), { type: "SET_THROTTLE", throttle: 1 });
    let prev = 0;
    for (let i = 0; i < 90; i++) {
      s = step(s, DT).state;
      assert.ok(s.boat.speed - prev <= BOAT.acceleration * (DT / 1000) + 1e-12, "accelerated too fast");
      assert.ok(s.boat.speed <= BOAT.maxSpeed, "overshot max speed");
      prev = s.boat.speed;
    }
    assert.equal(s.boat.speed, BOAT.maxSpeed); // 3 s is enough to reach full speed
    s = drive(s, [{ type: "SET_THROTTLE", throttle: 0 }], 90);
    assert.equal(s.boat.speed, 0); // and to stop again, never going negative
  });

  test("positive rudder increases heading, negative decreases it (wrapping), stopped boat doesn't turn", () => {
    const moving = drive(started(), [{ type: "SET_THROTTLE", throttle: 1 }], 30);
    assert.equal(moving.boat.heading, 0);

    const right = drive(moving, [{ type: "STEER", rudder: 1 }], 10);
    assert.ok(right.boat.heading > 0 && right.boat.heading < Math.PI / 2, `starboard turn gave ${right.boat.heading}`);

    // Turning port from heading 0 wraps to just under 2π, not a negative angle.
    const left = drive(moving, [{ type: "STEER", rudder: -1 }], 10);
    assert.ok(left.boat.heading > (3 * Math.PI) / 2 && left.boat.heading < 2 * Math.PI, `port turn gave ${left.boat.heading}`);
    assert.ok(Math.abs(angleDelta(0, left.boat.heading) + angleDelta(0, right.boat.heading)) < 1e-9, "turns should be symmetric");

    const stopped = drive(started(), [{ type: "STEER", rudder: 1 }], 60);
    assert.equal(stopped.boat.heading, 0);

    // Spin for a long time: heading always stays in [0, 2π).
    let spin = drive(moving, [{ type: "STEER", rudder: 1 }], 0);
    for (let i = 0; i < 600; i++) {
      spin = step(spin, DT).state;
      assert.ok(spin.boat.heading >= 0 && spin.boat.heading < 2 * Math.PI, `heading out of range: ${spin.boat.heading}`);
    }
  });

  test("boat cannot leave the map on any edge", () => {
    const min = MAP.edgePadding;
    const max = 1 - MAP.edgePadding;
    const edges = [
      { name: "north", heading: 0, axis: "y", bound: min },
      { name: "east", heading: Math.PI / 2, axis: "x", bound: max },
      { name: "south", heading: Math.PI, axis: "y", bound: max },
      { name: "west", heading: (3 * Math.PI) / 2, axis: "x", bound: min },
    ] as const;

    for (const edge of edges) {
      const base = started();
      let s: GameState = { ...base, boat: { ...base.boat, heading: edge.heading } };
      s = captain(s, { type: "SET_THROTTLE", throttle: 1 });
      const steps = Math.round(20_000 / DT); // 20 simulated seconds
      for (let i = 0; i < steps; i++) {
        s = step(s, DT).state;
        const { x, y } = s.boat.position;
        assert.ok(x >= min && x <= max && y >= min && y <= max, `${edge.name}: left the map at (${x}, ${y})`);
      }
      // Make sure we actually reached the edge (otherwise the test proves nothing).
      assert.ok(Math.abs(s.boat.position[edge.axis] - edge.bound) < 1e-9, `${edge.name}: never reached the edge`);
    }
  });

  test("same seed, actions and dt sequence => identical state (determinism)", () => {
    const script: { action?: PlayerAction; dt: number }[] = [
      { action: { type: "SET_THROTTLE", throttle: 0.8 }, dt: DT },
      { dt: 16 },
      { action: { type: "STEER", rudder: 0.6 }, dt: 50 },
      { dt: DT },
      { action: { type: "STEER", rudder: -1 }, dt: 7.5 },
      { action: { type: "SET_THROTTLE", throttle: 0.3 }, dt: 100 },
    ];
    const run = () => {
      let s = applyAction(createInitialState({ seed: 7, gameId: "det" }), { type: "START_GAME" }, "host").state;
      for (let lap = 0; lap < 40; lap++) {
        for (const { action, dt } of script) {
          if (action) s = captain(s, action);
          s = step(s, dt).state;
        }
      }
      return s;
    };
    const a = run();
    const b = run();
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.boat.position, MISSION.boatStart); // it really moved
  });
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
