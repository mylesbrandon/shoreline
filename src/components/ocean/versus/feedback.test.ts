import { test } from "node:test";
import assert from "node:assert/strict";
import { mockScoreboardAt } from "@/game/versus/mock";
import type { RescueEvent } from "@/game/versus/contract";
import { countdownLabel, isFinalCountdown, newLeader, rescueKey, unseenRescues } from "./feedback";

test("countdown uses mission snapshots, includes GO for the first active second", () => {
  assert.equal(countdownLabel(mockScoreboardAt(0)), "3");
  assert.equal(countdownLabel(mockScoreboardAt(1000)), "2");
  assert.equal(countdownLabel(mockScoreboardAt(2000)), "1");
  assert.equal(countdownLabel(mockScoreboardAt(3000)), "GO!");
  assert.equal(countdownLabel(mockScoreboardAt(3999)), "GO!");
  assert.equal(countdownLabel(mockScoreboardAt(4000)), null);
  assert.equal(countdownLabel(mockScoreboardAt(123000)), null);
});
test("urgency is active-only and starts exactly at ten seconds remaining", () => {
  assert.equal(isFinalCountdown(mockScoreboardAt(112999)), false);
  assert.equal(isFinalCountdown(mockScoreboardAt(113000)), true);
  assert.equal(isFinalCountdown(mockScoreboardAt(123000)), false);
});
test("rescue feed dedupes overlapping snapshots and duplicate entries without mutation", () => {
  const blue: RescueEvent = { team: "blue", survivorIndex: 0, atMs: 18000, position: { x: 0.8, y: 0.1 } };
  const red: RescueEvent = { ...blue, team: "red" };
  const seen = new Set([rescueKey("one", blue)]);
  assert.deepEqual(unseenRescues("one", [blue, red, red], seen), [red]);
  assert.equal(seen.size, 1);
  assert.equal(unseenRescues("two", [blue, red], seen).length, 2);
  assert.deepEqual(unseenRescues("one", [], seen), []);
});
test("lead change announces only new non-null leaders during active play", () => {
  const scoreboard = mockScoreboardAt(21000);
  assert.equal(newLeader(null, scoreboard), "blue");
  assert.equal(newLeader("red", scoreboard), "blue");
  assert.equal(newLeader("blue", scoreboard), null);
  assert.equal(newLeader("blue", { ...scoreboard, leader: null }), null);
  assert.equal(newLeader("blue", { ...scoreboard, phase: "ended", leader: "red" }), null);
});
