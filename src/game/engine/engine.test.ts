/**
 * Engine tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1. The `todo` tests below are your FIRST TASK — see docs/TASKS.md.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createInitialState, getRoleViews, getSpectatorView, step, type SenderRole } from "./index";
import { BOAT, MAP, MISSION, NETWORK, RADIO, SONAR, TARGET, WEATHER } from "../config";
import type { CurrentForecastEntry, GameState, PlayerAction, SectorId, Vec2 } from "../types";
import { ALL_SECTORS, sectorCenter } from "../sectors";
import { MARKERS, signalStrength } from "./actions";

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

/**
 * Replace the hazards with test ones placed `d` east of the boat. Each spreads a real starter
 * hazard, so these stay valid if the Hazard contract gains fields.
 */
function hazardsEastOfBoat(state: GameState, hazards: { id: string; d: number; radius: number }[]): GameState {
  const template = state.hazards[0];
  assert.ok(template, "starter layout has hazards");
  const { x, y } = state.boat.position;
  return {
    ...state,
    hazards: hazards.map(({ id, d, radius }) => ({
      ...template,
      id,
      radius,
      revealed: false,
      lastHitAtMs: null,
      position: { x: x + d, y },
    })),
  };
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

describe("sonar", () => {
  const ping = (state: GameState, sender: SenderRole = "sonar") => applyAction(state, { type: "SONAR_PING" }, sender);

  test("a ping reveals hazards within range, records contacts and emits SONAR_PINGED", () => {
    const r0 = 0.03;
    const s = hazardsEastOfBoat(at(started(), 2_000), [
      { id: "near", d: 0.1, radius: r0 },
      { id: "edge", d: SONAR.pingRange + r0 - 0.001, radius: r0 }, // only its rim is in range
      { id: "far", d: SONAR.pingRange + r0 + 0.001, radius: r0 },
    ]);
    const snapshot = structuredClone(s);
    const r = ping(s);
    assert.deepEqual(s, snapshot, "applyAction mutated its input");
    assert.equal(r.rejected, null);

    const origin = s.boat.position;
    assert.deepEqual(r.events, [{ type: "SONAR_PINGED", origin, contactsFound: 2, atMs: 2_000 }]);
    assert.deepEqual(
      r.state.hazards.map((h) => [h.id, h.revealed]),
      [["near", true], ["edge", true], ["far", false]],
    );
    assert.deepEqual(
      r.state.sonar.contacts.map((c) => [c.hazardId, c.detectedAtMs]),
      [["near", 2_000], ["edge", 2_000]],
    );
    assert.equal(r.state.sonar.pingsUsed, 1);
    assert.equal(r.state.sonar.lastPingAtMs, 2_000);
    assert.deepEqual(r.state.sonar.lastPingOrigin, origin);

    // Revealed hazards reach the captain and spectator, the unrevealed one stays hidden.
    const views = getRoleViews(r.state);
    assert.deepEqual(views.sonar.contacts, r.state.sonar.contacts);
    assert.deepEqual(views.captain.visibleHazards.map((h) => h.id).sort(), ["edge", "near"]);
    assert.deepEqual(getSpectatorView(r.state).hazards.map((h) => h.id).sort(), ["edge", "near"]);
  });

  test("pings are sonar-only and cooldown-limited, matching the view's pingReadyAtMs", () => {
    assert.equal(ping(started(), "captain").rejected, "not_permitted");
    assert.equal(ping(fresh()).rejected, "wrong_phase");

    const first = ping(at(started(), 1_000));
    assert.equal(first.rejected, null);
    const readyAt = getRoleViews(first.state).sonar.pingReadyAtMs;
    assert.equal(readyAt, 1_000 + SONAR.pingCooldownMs);

    const tooSoon = at(first.state, readyAt - 1);
    const early = ping(tooSoon);
    assert.equal(early.rejected, "cooldown");
    assert.deepEqual(early.events, []);
    assert.equal(early.state, tooSoon, "a rejected ping returns the unchanged input");

    const again = ping(at(first.state, readyAt));
    assert.equal(again.rejected, null);
    assert.equal(again.state.sonar.pingsUsed, 2);
  });

  test("re-detecting a hazard refreshes its contact instead of duplicating it; old contacts persist", () => {
    let s = hazardsEastOfBoat(at(started(), 0), [
      { id: "a", d: 0.1, radius: 0.03 },
      { id: "b", d: -0.2, radius: 0.03 },
    ]);
    s = ping(s).state;
    // Move the boat so only "a" is in range of the second ping.
    s = { ...s, boat: { ...s.boat, position: { x: s.boat.position.x + 0.15, y: s.boat.position.y } } };
    const r = ping(at(s, SONAR.pingCooldownMs));
    assert.deepEqual(r.events, [
      { type: "SONAR_PINGED", origin: r.state.boat.position, contactsFound: 1, atMs: SONAR.pingCooldownMs },
    ]);
    assert.deepEqual(
      r.state.sonar.contacts.map((c) => [c.hazardId, c.detectedAtMs]),
      [["b", 0], ["a", SONAR.pingCooldownMs]],
    );
  });
});

describe("radio", () => {
  const scan = (state: GameState, sector: SectorId, sender: SenderRole = "radio") =>
    applyAction(state, { type: "RADIO_SCAN", sector }, sender);
  const withTarget = (state: GameState, position: Vec2): GameState => ({ ...state, target: { ...state.target, position } });

  test("signal is 1 only in the target's sector and fades with distance elsewhere", () => {
    const target = sectorCenter("B2");
    const byDistance = [...ALL_SECTORS].sort(
      (a, b) =>
        Math.hypot(sectorCenter(a).x - target.x, sectorCenter(a).y - target.y) -
        Math.hypot(sectorCenter(b).x - target.x, sectorCenter(b).y - target.y),
    );
    assert.equal(byDistance[0], "B2");
    const strengths = byDistance.map((sector) => signalStrength(target, sector));
    assert.equal(strengths[0], 1);
    for (let i = 1; i < strengths.length; i++) {
      const s = strengths[i] ?? Number.NaN;
      assert.ok(s >= 0 && s < 1, `${byDistance[i]} read ${s}`);
      assert.ok(s <= (strengths[i - 1] ?? Number.NaN), `${byDistance[i]} is farther but stronger`);
      assert.equal(Math.round(s * 100) / 100, s, "rounded to 2 decimals");
    }
    assert.equal(signalStrength(target, "D4"), 0); // far corner is silent
    // Anywhere inside the sector reads 1, not just the center.
    assert.equal(signalStrength({ x: 0.26, y: 0.49 }, "B2"), 1);
  });

  test("a scan records one reading per sector, emits RADIO_SCANNED and never exposes the target", () => {
    const s0 = withTarget(at(started(), 1_000), { x: 0.82, y: 0.12 });
    const snapshot = structuredClone(s0);
    const r = scan(s0, "C1");
    assert.deepEqual(s0, snapshot, "applyAction mutated its input");
    assert.equal(r.rejected, null);
    const strength = signalStrength(s0.target.position, "C1");
    assert.ok(strength > 0 && strength < 1);
    assert.deepEqual(r.state.radio.readings, [{ sector: "C1", strength, atMs: 1_000 }]);
    assert.deepEqual(r.events, [{ type: "RADIO_SCANNED", sector: "C1", strength, atMs: 1_000 }]);
    assert.equal(r.state.radio.scansUsed, 1);
    assert.equal(r.state.radio.lastScanAtMs, 1_000);

    const radio = getRoleViews(r.state).radio;
    assert.deepEqual(radio.readings, r.state.radio.readings);
    assert.ok(!JSON.stringify(radio).includes("0.82"), "radio view leaks the target x");

    // Scanning other sectors adds readings; rescanning a sector replaces its reading.
    let s = scan(at(r.state, 1_000 + RADIO.scanCooldownMs), "D1").state;
    s = scan(at(s, 1_000 + 2 * RADIO.scanCooldownMs), "C1").state;
    assert.deepEqual(
      s.radio.readings.map((x) => [x.sector, x.strength, x.atMs]),
      [
        ["D1", 1, 1_000 + RADIO.scanCooldownMs],
        ["C1", strength, 1_000 + 2 * RADIO.scanCooldownMs],
      ],
    );
    assert.equal(s.radio.scansUsed, 3);
  });

  test("scans are radio-only, need a real sector and are cooldown-limited like scanReadyAtMs", () => {
    assert.equal(scan(started(), "A1", "captain").rejected, "not_permitted");
    assert.equal(scan(started(), "E9" as SectorId).rejected, "invalid_payload");

    const first = scan(at(started(), 500), "A1");
    const readyAt = getRoleViews(first.state).radio.scanReadyAtMs;
    assert.equal(readyAt, 500 + RADIO.scanCooldownMs);
    const tooSoon = at(first.state, readyAt - 1);
    const early = scan(tooSoon, "A2");
    assert.equal(early.rejected, "cooldown");
    assert.equal(early.state, tooSoon);
    assert.equal(scan(at(first.state, readyAt), "A2").rejected, null);
  });
});

describe("markers", () => {
  const markHazard = (state: GameState, x: number, sender: SenderRole = "sonar") =>
    applyAction(state, { type: "MARK_HAZARD", position: { x, y: 0.5 } }, sender);
  const markTarget = (state: GameState, x: number) =>
    applyAction(state, { type: "MARK_TARGET", position: { x, y: 0.2 } }, "radio");

  test("sonar and radio place shared markers that every role sees", () => {
    const h = markHazard(at(started(), 700), 0.3);
    assert.equal(h.rejected, null);
    const marker = { id: "m1", kind: "hazard", position: { x: 0.3, y: 0.5 }, placedBy: "sonar", placedAtMs: 700 };
    assert.deepEqual(h.state.markers, [marker]);
    assert.deepEqual(h.events, [{ type: "MARKER_PLACED", marker, atMs: 700 }]);

    const t = markTarget(h.state, 0.8);
    assert.deepEqual(t.state.markers.map((m) => [m.id, m.kind, m.placedBy]), [
      ["m1", "hazard", "sonar"],
      ["m2", "target_guess", "radio"],
    ]);
    for (const view of Object.values(getRoleViews(t.state))) assert.deepEqual(view.markers, t.state.markers);
    assert.deepEqual(getSpectatorView(t.state).markers, t.state.markers);
  });

  test("permissions and positions are validated", () => {
    assert.equal(markHazard(started(), 0.3, "captain").rejected, "not_permitted");
    assert.equal(applyAction(started(), { type: "MARK_TARGET", position: { x: 0.3, y: 0.5 } }, "sonar").rejected, "not_permitted");
    assert.equal(markHazard(started(), 1.2).rejected, "invalid_payload");
    assert.equal(markHazard(started(), Number.NaN).rejected, "invalid_payload");
  });

  test("radio keeps one target guess; sonar keeps its newest hazard marks; ids keep increasing", () => {
    let s = markTarget(started(), 0.1).state;
    s = markTarget(s, 0.9).state;
    assert.deepEqual(s.markers.map((m) => [m.id, m.kind, m.position.x]), [["m2", "target_guess", 0.9]]);

    for (let i = 0; i < MARKERS.maxHazardMarks + 3; i++) s = markHazard(s, i / 20).state;
    const hazards = s.markers.filter((m) => m.kind === "hazard");
    assert.equal(hazards.length, MARKERS.maxHazardMarks);
    assert.deepEqual(hazards.map((m) => m.position.x), [3, 4, 5, 6, 7, 8, 9, 10].map((i) => i / 20));
    assert.ok(s.markers.some((m) => m.kind === "target_guess"), "hazard cap must not evict the target guess");
    const ids = s.markers.map((m) => Number(m.id.slice(1)));
    assert.equal(new Set(ids).size, ids.length, "marker ids are unique");
    assert.equal(s.markers.at(-1)?.id, `m${2 + MARKERS.maxHazardMarks + 3}`);
  });
});

describe("hazard collisions", () => {
  /** Calm water, boat stopped, clock at `elapsedMs`, with the given hazards east of the boat. */
  function onReef(elapsedMs: number, hazards: { id: string; d: number; radius: number }[], hull: number = BOAT.startHull): GameState {
    const s = hazardsEastOfBoat(withCurrent(at(started(), elapsedMs), { x: 0, y: 0 }), hazards);
    return { ...s, boat: { ...s.boat, hull } };
  }

  test("driving into a hazard damages the hull, reveals it and emits HAZARD_HIT", () => {
    const s = onReef(1_000, [{ id: "reef", d: 0.01, radius: 0.03 }]);
    const snapshot = structuredClone(s);
    const r = step(s, 100);
    assert.deepEqual(s, snapshot, "step mutated its input");
    assert.equal(r.state.boat.hull, BOAT.startHull - BOAT.collisionDamage);
    assert.equal(r.state.stats.hazardsHit, 1);
    assert.deepEqual(r.events, [{ type: "HAZARD_HIT", hazardId: "reef", damage: BOAT.collisionDamage, atMs: 1_100 }]);
    assert.deepEqual(
      r.state.hazards.map((h) => [h.id, h.revealed, h.lastHitAtMs]),
      [["reef", true, 1_100]],
    );
    assert.ok(getRoleViews(r.state).captain.visibleHazards.some((h) => h.id === "reef"));
  });

  test("a hazard just outside the boat does nothing", () => {
    const r = step(onReef(1_000, [{ id: "reef", d: 0.03 + 0.001, radius: 0.03 }]), DT);
    assert.equal(r.state.boat.hull, BOAT.startHull);
    assert.deepEqual(r.events, []);
    assert.equal(r.state.hazards[0]?.lastHitAtMs, null);
  });

  test("the same hazard can't hit again until collisionCooldownMs has passed", () => {
    let r = step(onReef(1_000, [{ id: "reef", d: 0, radius: 0.03 }]), 100); // hit at 1100
    assert.equal(r.state.boat.hull, 75);

    r = step(r.state, BOAT.collisionCooldownMs - 1); // 1 ms short of the cooldown, still on the reef
    assert.equal(r.state.boat.hull, 75);
    assert.deepEqual(r.events, []);

    r = step(r.state, 1); // exactly collisionCooldownMs after the first hit
    assert.equal(r.state.boat.hull, 50);
    assert.deepEqual(r.events, [
      { type: "HAZARD_HIT", hazardId: "reef", damage: BOAT.collisionDamage, atMs: 1_100 + BOAT.collisionCooldownMs },
    ]);
    assert.equal(r.state.stats.hazardsHit, 2);
  });

  test("overlapping hazards each hit once in the same step", () => {
    const r = step(
      onReef(0, [
        { id: "a", d: 0.01, radius: 0.03 },
        { id: "b", d: -0.01, radius: 0.03 },
      ]),
      DT,
    );
    assert.equal(r.state.boat.hull, BOAT.startHull - 2 * BOAT.collisionDamage);
    assert.deepEqual(r.events.map((e) => e.type === "HAZARD_HIT" && e.hazardId), ["a", "b"]);
    assert.equal(r.state.stats.hazardsHit, 2);
  });

  test("losing the last hull point fails the mission with hull_destroyed, even at the Gull", () => {
    let s = onReef(20_000, [{ id: "reef", d: 0, radius: 0.03 }], 10);
    s = { ...s, target: { ...s.target, position: s.boat.position } }; // also inside the rescue radius
    const r = step(s, 100);
    assert.equal(r.state.boat.hull, 0, "hull never goes negative");
    assert.equal(r.state.mission.phase, "failure");
    assert.equal(r.state.mission.failureReason, "hull_destroyed");
    assert.deepEqual(r.events, [
      { type: "HAZARD_HIT", hazardId: "reef", damage: 10, atMs: 20_100 },
      { type: "MISSION_ENDED", phase: "failure", reason: "hull_destroyed", atMs: 20_100 },
    ]);
    assert.equal(r.state.mission.score?.total, 0);
    assert.equal(r.state.mission.score?.hullRemaining, 0);
    assert.equal(r.state.mission.score?.hazardsHit, 1);
    assert.equal(step(r.state, DT).state, r.state, "a sunk boat doesn't keep simulating");
  });

  test("hits stop once the hull is gone", () => {
    const r = step(
      onReef(0, [
        { id: "a", d: 0, radius: 0.03 },
        { id: "b", d: 0.005, radius: 0.03 },
      ], 20),
      DT,
    );
    assert.deepEqual(r.events.map((e) => e.type), ["HAZARD_HIT", "MISSION_ENDED"]);
    assert.equal(r.state.stats.hazardsHit, 1);
    assert.equal(r.state.hazards.find((h) => h.id === "b")?.lastHitAtMs, null);
  });
});

describe("rescue and score", () => {
  /** Calm water, boat parked `offset` east of the Gull, mission clock at `elapsedMs`. */
  function nearGull(offset: number, elapsedMs: number, hull: number = BOAT.startHull): GameState {
    const s = withCurrent(at(started(), elapsedMs), { x: 0, y: 0 });
    const position = { x: s.target.position.x + offset, y: s.target.position.y };
    return { ...s, boat: { ...s.boat, position, hull } };
  }

  test("reaching the Gull ends the mission in victory with a score", () => {
    let s = nearGull(TARGET.rescueRadius * 0.9, 29_900, 75);
    s = { ...s, stats: { ...s.stats, shieldsUsed: 2 } };
    const r = step(s, 100);
    assert.equal(r.state.mission.phase, "victory");
    assert.equal(r.state.mission.failureReason, null);
    assert.deepEqual(r.events, [{ type: "MISSION_ENDED", phase: "victory", reason: null, atMs: 30_000 }]);
    // 1000 rescue bonus + 60 s left × 10 + 75 hull × 5
    assert.deepEqual(r.state.mission.score, {
      timeRemainingMs: 60_000,
      hullRemaining: 75,
      hazardsHit: 0,
      pingsUsed: 0,
      scansUsed: 0,
      shieldsUsed: 2,
      total: 1_975,
    });
    assert.equal(step(r.state, DT).state, r.state, "a finished mission doesn't keep simulating");
    assert.deepEqual(getSpectatorView(r.state).target, s.target);
  });

  test("a boat just outside the rescue radius keeps searching", () => {
    const r = step(nearGull(TARGET.rescueRadius + 0.001, 10_000), DT);
    assert.equal(r.state.mission.phase, "active");
    assert.equal(r.state.mission.score, null);
    assert.deepEqual(r.events, []);
  });

  test("a rescue on the final step beats the timeout", () => {
    const r = step(nearGull(0, MISSION.durationMs - 1), DT);
    assert.equal(r.state.mission.phase, "victory");
    assert.deepEqual(r.events, [{ type: "MISSION_ENDED", phase: "victory", reason: null, atMs: MISSION.durationMs }]);
    assert.equal(r.state.mission.score?.timeRemainingMs, 0);
    assert.equal(r.state.mission.score?.total, 1_500); // bonus + full hull, no time left
  });

  test("a timeout scores 0 but still reports the mission stats", () => {
    let s = withCurrent(started(), { x: 0, y: 0 });
    s = shield(s).state;
    const r = step(at(s, MISSION.durationMs - 1), DT);
    assert.equal(r.state.mission.phase, "failure");
    assert.deepEqual(r.state.mission.score, {
      timeRemainingMs: 0,
      hullRemaining: BOAT.startHull,
      hazardsHit: 0,
      pingsUsed: 0,
      scansUsed: 0,
      shieldsUsed: 1,
      total: 0,
    });
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
