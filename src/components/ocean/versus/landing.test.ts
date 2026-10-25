import { test } from "node:test";
import assert from "node:assert/strict";
import { LANDING, landedBy, revealAt, stepFor, stepOffAt } from "./landing";

test("people step off one at a time after the skis dock", () => {
  assert.equal(stepOffAt(0, 3), LANDING.boatsInMs);
  assert.equal(stepOffAt(1, 3), LANDING.boatsInMs + LANDING.stepMs);
  assert.equal(landedBy(LANDING.boatsInMs + LANDING.walkMs - 1, 3), 0);
  assert.equal(landedBy(LANDING.boatsInMs + LANDING.walkMs, 3), 1);
  assert.equal(landedBy(LANDING.boatsInMs + LANDING.stepMs + LANDING.walkMs, 3), 2);
  assert.equal(landedBy(60_000, 3), 3);
});

test("the count never passes the score, and zero means nobody steps off", () => {
  for (const n of [0, 1, 5, 30]) assert.equal(landedBy(60_000, n), n);
  assert.equal(landedBy(60_000, 0), 0);
});

test("big scores unload faster so the landing stays short", () => {
  assert.equal(stepFor(4), LANDING.stepMs);
  assert.ok(stepFor(30) < LANDING.stepMs);
  assert.ok(stepOffAt(29, 30) - LANDING.boatsInMs <= LANDING.maxUnloadMs + 1e-9);
});

test("the winner is revealed only after the slower crew's last person lands", () => {
  const t = revealAt(2, 5);
  assert.equal(landedBy(t - LANDING.holdMs, 5), 5);
  assert.equal(landedBy(t - LANDING.holdMs - 1, 5), 4);
  assert.equal(revealAt(0, 0), LANDING.boatsInMs + LANDING.holdMs);
  assert.equal(revealAt(2, 5), revealAt(5, 2), "same timing whichever crew is slower");
});
