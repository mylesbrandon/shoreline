/**
 * Pure parts of the Supabase transport (no network).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { flattenPresence } from "./supabase-transport";

describe("flattenPresence", () => {
  test("one member per key, newest connection wins, Supabase fields stripped", () => {
    const members = flattenPresence({
      host: [{ playerId: "host", name: "Host", kind: "host", onlineAt: 1, presence_ref: "a" }],
      p1: [
        { playerId: "p1", name: "Old tab", kind: "player", onlineAt: 5, presence_ref: "b" },
        { playerId: "p1", name: "New tab", kind: "player", onlineAt: 9, presence_ref: "c" },
      ],
    });
    assert.deepEqual(members, [
      { playerId: "host", name: "Host", kind: "host", onlineAt: 1 },
      { playerId: "p1", name: "New tab", kind: "player", onlineAt: 9 },
    ]);
  });

  test("malformed entries are ignored", () => {
    const members = flattenPresence({
      x: [{ playerId: "x", name: 42, kind: "player", onlineAt: 1 }],
      y: [null, "nope"],
      z: [{ playerId: "z", name: "Zed", kind: "player", onlineAt: 2 }],
    });
    assert.deepEqual(members.map((m) => m.playerId), ["z"]);
  });
});
