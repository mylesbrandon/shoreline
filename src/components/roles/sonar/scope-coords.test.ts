import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clamp01, SCOPE_DISPLAY_RANGE, scopeToWorld, tapInWell } from "./scope-coords";

describe("scopeToWorld", () => {
  const boat = { x: 0.5, y: 0.78 };

  test("center tap is the boat", () => {
    assert.deepEqual(scopeToWorld({ x: 0.5, y: 0.5 }, boat), boat);
  });

  test("returns values inside [0, 1]", () => {
    const far = scopeToWorld({ x: 0, y: 0 }, { x: 0.02, y: 0.02 });
    assert.ok(far.x >= 0 && far.x <= 1);
    assert.ok(far.y >= 0 && far.y <= 1);
    const other = scopeToWorld({ x: 1, y: 1 }, { x: 0.98, y: 0.98 });
    assert.ok(other.x >= 0 && other.x <= 1);
    assert.ok(other.y >= 0 && other.y <= 1);
  });

  test("left of center is west of the boat", () => {
    const marked = scopeToWorld({ x: 0.25, y: 0.5 }, boat);
    assert.ok(marked.x < boat.x);
    assert.equal(marked.y, boat.y);
    assert.equal(marked.x, clamp01(boat.x - SCOPE_DISPLAY_RANGE / 2));
  });

  test("non-finite tap collapses to a valid position", () => {
    const marked = scopeToWorld({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, boat);
    assert.ok(marked.x >= 0 && marked.x <= 1);
    assert.ok(marked.y >= 0 && marked.y <= 1);
  });
});

describe("tapInWell", () => {
  test("center is inside, square corners are outside", () => {
    assert.equal(tapInWell({ x: 0.5, y: 0.5 }), true);
    assert.equal(tapInWell({ x: 0, y: 0 }), false);
    assert.equal(tapInWell({ x: 1, y: 1 }), false);
  });
});
