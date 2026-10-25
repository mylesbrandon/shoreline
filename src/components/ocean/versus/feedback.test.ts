import { VERSUS } from "@/game/versus/contract";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockScoreboardAt } from "@/game/versus/mock";
import type { RescueEvent } from "@/game/versus/contract";
import { countdownLabel, isFinalCountdown, newLeader, rescueKey, unseenRescues } from "./feedback";

test("countdown uses mission snapshots, includes GO for the first active second", () => {
  // Numbers follow the countdown clip's voice (COUNTDOWN_BEATS_MS); GO at VERSUS.countdownMs.
  assert.equal(countdownLabel(mockScoreboardAt(0)), "Ready");
  assert.equal(countdownLabel(mockScoreboardAt(549)), "Ready");
  assert.equal(countdownLabel(mockScoreboardAt(550)), "3");
  assert.equal(countdownLabel(mockScoreboardAt(1599)), "3");
  assert.equal(countdownLabel(mockScoreboardAt(1600)), "2");
  assert.equal(countdownLabel(mockScoreboardAt(2500)), "1");
  assert.equal(countdownLabel(mockScoreboardAt(3499)), "1");
  assert.equal(countdownLabel(mockScoreboardAt(3500)), "GO!");
  assert.equal(countdownLabel(mockScoreboardAt(4499)), "GO!");
  assert.equal(countdownLabel(mockScoreboardAt(4500)), null);
  assert.equal(countdownLabel(mockScoreboardAt(123000)), null);
});
test("urgency is active-only and starts exactly at ten seconds remaining", () => {
  // Mock time includes the countdown, so match time = t - VERSUS.countdownMs.
  const finalAt = VERSUS.countdownMs + VERSUS.matchDurationMs - VERSUS.finalCountdownMs;
  assert.equal(isFinalCountdown(mockScoreboardAt(finalAt - 1)), false);
  assert.equal(isFinalCountdown(mockScoreboardAt(finalAt)), true);
  assert.equal(isFinalCountdown(mockScoreboardAt(VERSUS.countdownMs + VERSUS.matchDurationMs)), false);
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
  const scoreboard = mockScoreboardAt(VERSUS.countdownMs + 18_000);
  assert.equal(newLeader(null, scoreboard), "blue");
  assert.equal(newLeader("red", scoreboard), "blue");
  assert.equal(newLeader("blue", scoreboard), null);
  assert.equal(newLeader("blue", { ...scoreboard, leader: null }), null);
  assert.equal(newLeader("blue", { ...scoreboard, phase: "ended", leader: "red" }), null);
});
