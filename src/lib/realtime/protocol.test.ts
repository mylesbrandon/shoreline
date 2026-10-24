import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMessage, isNetworkMessage, RecentIds, SeqTracker, ViewOrderTracker } from "./protocol";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./room-code";

describe("messages", () => {
  test("createMessage produces a valid NetworkMessage", () => {
    const m = createMessage("p1", { type: "test", text: "ahoy" }, 123);
    assert.ok(isNetworkMessage(m));
    assert.equal(m.from, "p1");
    assert.equal(m.sentAt, 123);
  });

  test("garbage is rejected", () => {
    assert.equal(isNetworkMessage(null), false);
    assert.equal(isNetworkMessage({ type: "test" }), false);
    assert.equal(isNetworkMessage({ v: 1, msgId: "a", from: "b", sentAt: 1, type: "hack" }), false);
  });
});

describe("dedupe and ordering", () => {
  test("SeqTracker drops duplicate and out-of-order actions", () => {
    const t = new SeqTracker();
    assert.equal(t.accept("p1", 1), true);
    assert.equal(t.accept("p1", 1), false);
    assert.equal(t.accept("p1", 3), true);
    assert.equal(t.accept("p1", 2), false);
    assert.equal(t.accept("p2", 1), true);
    t.resetPlayer("p1");
    assert.equal(t.accept("p1", 1), true);
  });

  test("ViewOrderTracker drops stale views but accepts a new game", () => {
    const t = new ViewOrderTracker();
    assert.equal(t.accept("g1", 10), true);
    assert.equal(t.accept("g1", 9), false);
    assert.equal(t.accept("g1", 10), false);
    assert.equal(t.accept("g2", 0), true);
  });

  test("RecentIds drops exact duplicates within capacity", () => {
    const r = new RecentIds(2);
    assert.equal(r.add("a"), true);
    assert.equal(r.add("a"), false);
    r.add("b");
    r.add("c");
    assert.equal(r.add("a"), true); // evicted, so treated as new
  });
});

describe("room codes", () => {
  test("generated codes are valid", () => {
    for (let i = 0; i < 50; i++) assert.ok(isValidRoomCode(generateRoomCode()));
  });

  test("normalization", () => {
    assert.equal(normalizeRoomCode(" wa-ve1 "), "WAVE");
    assert.equal(isValidRoomCode("WAV"), false);
  });
});
