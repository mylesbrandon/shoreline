import { test } from "node:test";
import assert from "node:assert/strict";
import { mockScoreboardAt } from "@/game/versus/mock";
import { hullColour, scoreNotices } from "./score-feedback";
const board = () => mockScoreboardAt(23000);
test("pickup feedback comes from score deltas, even without events", () => {
  const before = board(), after = structuredClone(before);
  after.scores.blue.rescues++;
  assert.deepEqual(scoreNotices(before, after).map(n=>[n.team,n.label]), [["blue","PICKED UP!"]]);
  assert.deepEqual(scoreNotices(after, after), []);
  assert.equal(before.scores.blue.rescues, 1);
});
for (const hull of [100, 75, 26, 25, 0]) {
  test("wipeout at previous hull " + hull + " is classified from the previous snapshot", () => {
    const before = board(), after = structuredClone(before);
    before.scores.red.hull = hull;
    after.scores.red.hull = 100;
    after.scores.red.wipeouts++;
    assert.equal(scoreNotices(before, after)[0]!.kind, hull <= 25 ? "wrecked" : "aground");
  });
}
test("initial, new match, rewind and count decreases do not create false notifications", () => {
  const before = board(), after = structuredClone(before);
  after.scores.blue.rescues++;
  assert.deepEqual(scoreNotices(null,after),[]);
  assert.deepEqual(scoreNotices(before,{...after,matchId:"new"}),[]);
  assert.deepEqual(scoreNotices(before,{...after,elapsedMs:0}),[]);
  assert.deepEqual(scoreNotices(after,before),[]);
});
test("simultaneous pickup and wipeout preserves both notices; wipeout has display priority", () => {
  const before = board(), after = structuredClone(before);
  after.scores.blue.rescues++;after.scores.blue.wipeouts++;
  assert.deepEqual(scoreNotices(before,after).map(n=>n.kind),["picked-up","aground"]);
});
test("hull colours use green, amber and red thresholds", () => {
  assert.equal(hullColour(100),"#4ade80");assert.equal(hullColour(51),"#4ade80");
  assert.equal(hullColour(50),"#ffc83d");assert.equal(hullColour(26),"#ffc83d");
  assert.equal(hullColour(25),"#ff6f61");assert.equal(hullColour(0),"#ff6f61");
});
