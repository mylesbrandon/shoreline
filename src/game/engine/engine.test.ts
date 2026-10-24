/**
 * Engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. The `todo` tests below are your FIRST TASK — see docs/TASKS.md.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createInitialState, getRoleViews, getSpectatorView, step, type SenderRole } from "./index";
import { BOAT, MAP, MISSION, NETWORK, WEATHER } from "../config";
import type { CurrentForecastEntry, GameState, PlayerAction, Vec2 } from "../types";

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

/** Replace the ocean current (and optionally the forecast). */
function withCurrent(state: GameState, current: Vec2, forecast: CurrentForecastEntry[] = []): GameState {
  return { ...state, weather: { ...state.weather, current, forecast } };
}

/** Jump the mission clock without simulating (for cooldown boundaries). */
function at(state: GameState, elapsedMs: number): GameState {
  return { ...state, mission: { ...state.mission, elapsedMs } };
}

const shield = (state: GameState, sender: SenderRole = "weather") => applyAction(state, { type: "WEATHER_SHIELD" }, sender);

/** Boat displacement over one step of DT ms. */
function drift(state: GameState): { next: GameState; dx: number; dy: number } {
  const next = step(state, DT).state;
  return { next, dx: next.boat.position.x - state.boat.position.x, dy: next.boat.position.y - state.boat.position.y };
}

const approx = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: expected ${expected}, got ${actual}`);

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

  test("boat moves north when heading 0 with full throttle (calm water)", () => {
    // The starting state has an eastward current; zero it so only the engine's own motion counts.
    const s = drive(withCurrent(started(), { x: 0, y: 0 }), [{ type: "SET_THROTTLE", throttle: 1 }], 60);
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

describe("weather", () => {
  const dt = DT / 1000;

  test("with throttle 0 the boat drifts by exactly current * dt per step, heading unchanged", () => {
    const current = { x: 0.01, y: -0.02 };
    let s = withCurrent(started(), current);
    for (let i = 0; i < 30; i++) {
      const r = drift(s);
      approx(r.dx, current.x * dt, `step ${i} dx`);
      approx(r.dy, current.y * dt, `step ${i} dy`);
      s = r.next;
    }
    assert.equal(s.boat.heading, 0);
    assert.equal(s.boat.speed, 0);
  });

  test("an active shield scales drift by shieldCurrentFactor; full drift returns after it expires", () => {
    const current = { x: 0.02, y: 0.01 };
    const r = shield(withCurrent(started(), current));
    assert.equal(r.rejected, null);
    assert.equal(r.state.weather.shieldActiveUntilMs, WEATHER.shieldDurationMs);
    assert.equal(getRoleViews(r.state).captain.shieldActive, true);

    const shielded = drift(r.state);
    approx(shielded.dx, current.x * WEATHER.shieldCurrentFactor * dt, "shielded dx");
    approx(shielded.dy, current.y * WEATHER.shieldCurrentFactor * dt, "shielded dy");

    let s = shielded.next;
    while (s.mission.elapsedMs < WEATHER.shieldDurationMs) s = step(s, DT).state;
    assert.equal(getRoleViews(s).captain.shieldActive, false);
    const full = drift(s);
    approx(full.dx, current.x * dt, "unshielded dx");
    approx(full.dy, current.y * dt, "unshielded dy");
  });

  test("shield is rejected during cooldown, allowed again afterward, weather-only", () => {
    assert.equal(shield(started(), "sonar").rejected, "not_permitted");

    const s0 = at(started(), 1_000);
    const snapshot = structuredClone(s0);
    const first = shield(s0);
    assert.deepEqual(s0, snapshot, "applyAction mutated its input");
    assert.equal(first.rejected, null);
    assert.deepEqual(first.events, [{ type: "SHIELD_ACTIVATED", untilMs: 1_000 + WEATHER.shieldDurationMs, atMs: 1_000 }]);
    assert.equal(first.state.weather.shieldReadyAtMs, 1_000 + WEATHER.shieldCooldownMs);
    assert.equal(first.state.stats.shieldsUsed, 1);

    const readyAt = first.state.weather.shieldReadyAtMs;
    const early = shield(at(first.state, readyAt - 1));
    assert.equal(early.rejected, "cooldown");
    assert.deepEqual(early.events, []);
    assert.equal(early.state.stats.shieldsUsed, 1);

    const again = shield(at(first.state, readyAt));
    assert.equal(again.rejected, null);
    assert.equal(again.state.stats.shieldsUsed, 2);
    assert.equal(again.state.weather.shieldActiveUntilMs, readyAt + WEATHER.shieldDurationMs);
  });

  test("a forecast entry applies once its atMs is reached, emits CURRENT_SHIFTED and is removed", () => {
    const shifted = { x: -0.015, y: 0.005 };
    const later: CurrentForecastEntry = { atMs: 5_000, current: { x: 0, y: 0.02 } };
    let s = withCurrent(started(), { x: 0.01, y: 0 }, [{ atMs: 100, current: shifted }, later]);

    let r = step(s, 60); // elapsed 60: not yet
    assert.deepEqual(r.events, []);
    assert.deepEqual(r.state.weather.current, { x: 0.01, y: 0 });
    assert.equal(r.state.weather.forecast.length, 2);

    r = step(r.state, 40); // elapsed exactly 100: applies
    assert.deepEqual(r.events, [{ type: "CURRENT_SHIFTED", current: shifted, atMs: 100 }]);
    assert.deepEqual(r.state.weather.current, shifted);
    assert.deepEqual(r.state.weather.forecast, [later]);

    // The next step drifts with the new current.
    s = r.state;
    const next = drift(s);
    approx(next.dx, shifted.x * dt, "dx after shift");
    approx(next.dy, shifted.y * dt, "dy after shift");
  });

  test("several forecast entries passing in one step: last one wins, one event each", () => {
    const a = { x: 0.01, y: 0 };
    const b = { x: 0, y: -0.01 };
    const c: CurrentForecastEntry = { atMs: 300, current: { x: -0.01, y: 0 } };
    const r = step(withCurrent(started(), { x: 0, y: 0 }, [{ atMs: 100, current: a }, { atMs: 200, current: b }, c]), 250);
    assert.deepEqual(r.events, [
      { type: "CURRENT_SHIFTED", current: a, atMs: 100 },
      { type: "CURRENT_SHIFTED", current: b, atMs: 200 },
    ]);
    assert.deepEqual(r.state.weather.current, b);
    assert.deepEqual(r.state.weather.forecast, [c]);
  });

  test("a current can't push the boat off the map", () => {
    const min = MAP.edgePadding;
    const max = 1 - MAP.edgePadding;
    const m = WEATHER.maxCurrent;
    const corners = [
      { name: "north-west", current: { x: -m, y: -m }, corner: { x: min, y: min } },
      { name: "north-east", current: { x: m, y: -m }, corner: { x: max, y: min } },
      { name: "south-east", current: { x: m, y: m }, corner: { x: max, y: max } },
      { name: "south-west", current: { x: -m, y: m }, corner: { x: min, y: max } },
    ];
    for (const { name, current, corner } of corners) {
      let s = withCurrent(started(), current);
      const steps = Math.round(30_000 / DT); // 30 s at maxCurrent covers > half the map
      for (let i = 0; i < steps; i++) {
        s = step(s, DT).state;
        const { x, y } = s.boat.position;
        assert.ok(x >= min && x <= max && y >= min && y <= max, `${name}: left the map at (${x}, ${y})`);
      }
      approx(s.boat.position.x, corner.x, `${name} x`);
      approx(s.boat.position.y, corner.y, `${name} y`);
      assert.equal(s.boat.heading, 0, `${name}: current changed heading`);
    }
  });

  test("determinism holds with a current, forecast and shield in play", () => {
    const run = () => {
      let s = createInitialState({ seed: 7, gameId: "det-weather" });
      s = applyAction(s, { type: "START_GAME" }, "host").state;
      s = withCurrent(s, { x: 0.012, y: -0.004 }, [
        { atMs: 3_000, current: { x: -0.02, y: 0.01 } },
        { atMs: 3_010, current: { x: 0.005, y: 0.025 } },
        { atMs: 17_500, current: { x: -0.03, y: 0 } },
      ]);
      s = captain(s, { type: "SET_THROTTLE", throttle: 0.6 });
      const dts = [DT, 16, 50, 7.5, 100]; // 600 steps ≈ 25 s: long enough for two shields and every shift
      for (let i = 0; i < 600; i++) {
        if (i % 25 === 0) s = shield(s).state; // some rejected by cooldown; state is unchanged then
        if (i % 40 === 0) s = captain(s, { type: "STEER", rudder: i % 80 === 0 ? 0.7 : -0.5 });
        s = step(s, dts[i % dts.length] ?? DT).state;
      }
      return s;
    };
    const a = run();
    const b = run();
    assert.deepEqual(a, b);
    assert.ok(a.stats.shieldsUsed >= 2, `expected several shields, got ${a.stats.shieldsUsed}`);
    assert.deepEqual(a.weather.forecast, []);
    assert.deepEqual(a.weather.current, { x: -0.03, y: 0 });
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
