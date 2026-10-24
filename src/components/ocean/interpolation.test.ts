import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoatState } from "@/game/types";
import { interpolateBoat } from "./interpolation";

const boat: BoatState = { position: { x: 0.2, y: 0.8 }, heading: 0, speed: 0, rudder: 0, throttle: 0, hull: 100 };
test("100ms samples produce intermediate positions without predicting beyond the buffer", () => {
  const next = { ...boat, position: { x: 0.4, y: 0.6 }, speed: 0.06 };
  const samples = [{ boat, at: 0 }, { boat: next, at: 100 }];
  assert.deepEqual(interpolateBoat(samples, -10), boat);
  assert.deepEqual(interpolateBoat(samples, 500), next);
  for (let at = 0; at <= 100; at += 1000 / 60) {
    const value = interpolateBoat(samples, at)!;
    assert.ok(Math.abs(value.position.x - (0.2 + at / 100 * 0.2)) < 1e-12);
  }
  assert.equal(samples[0]!.boat.position.x, 0.2);
});
test("heading crosses north over the short arc in both directions", () => {
  const rad = Math.PI / 180;
  for (const [a, b] of [[350, 10], [10, 350]]) {
    const value = interpolateBoat([{ boat: { ...boat, heading: a! * rad }, at: 0 }, { boat: { ...boat, heading: b! * rad }, at: 100 }], 50)!;
    assert.ok(Math.min(Math.abs(value.heading), Math.abs(value.heading - Math.PI * 2)) < 1e-12);
  }
});
test("empty, single and delayed/jittered samples hold or bracket safely", () => {
  assert.equal(interpolateBoat([], 10), null);
  assert.equal(interpolateBoat([{ boat, at: 10 }], 20), boat);
  const next = { ...boat, position: { x: 0.8, y: 0.2 } };
  const samples = [{ boat, at: 10 }, { boat: next, at: 210 }, { boat, at: 310 }];
  assert.ok(Math.abs(interpolateBoat(samples, 110)!.position.x - 0.5) < 1e-12);
  assert.equal(interpolateBoat(samples, 310)!.position.x, 0.2);
});
