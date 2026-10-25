/**
 * Pure parts of the Supabase transport (no network).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NetworkMessage } from "@/game/types";
import { createMessage } from "./protocol";
import { flattenPresence, SupabaseRoomTransport } from "./supabase-transport";

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

/**
 * Minimal stand-in for the parts of supabase-js the transport uses, reproducing the behaviors that
 * matter: channel() returns the existing object for a topic still in the list, removeChannel() is
 * async, and subscribing the same channel twice throws.
 */
function fakeClient() {
  const channels: FakeChannel[] = [];
  const delivered: { topic: string; payload: unknown }[] = [];
  class FakeChannel {
    subscribed = false;
    tracked: unknown = null;
    handlers: { type: string; event: string; cb: (arg: { payload: unknown }) => void }[] = [];
    constructor(readonly topic: string) {}
    on(type: string, filter: { event: string }, cb: (arg: { payload: unknown }) => void) {
      this.handlers.push({ type, event: filter.event, cb });
      return this;
    }
    subscribe(cb: (status: string) => void) {
      if (this.subscribed) throw new Error("tried to subscribe multiple times");
      this.subscribed = true;
      setTimeout(() => cb("SUBSCRIBED"), 1);
      return this;
    }
    async track(meta: unknown) {
      this.tracked = meta;
      return "ok";
    }
    async untrack() {
      this.tracked = null;
      return "ok";
    }
    presenceState() {
      return {};
    }
    async send(args: { payload: unknown }) {
      delivered.push({ topic: this.topic, payload: args.payload });
      return "ok";
    }
  }
  const client = {
    getChannels: () => [...channels],
    channel(topic: string) {
      const full = `realtime:${topic}`;
      const existing = channels.find((c) => c.topic === full);
      if (existing) return existing;
      const c = new FakeChannel(full);
      channels.push(c);
      return c;
    },
    async removeChannel(c: FakeChannel) {
      await new Promise((r) => setTimeout(r, 20)); // server round trip
      channels.splice(channels.indexOf(c), 1);
      return "ok";
    },
  };
  return { client: client as unknown as SupabaseClient, channels, delivered };
}

const me = { playerId: "p1", name: "Ana", kind: "player" as const, onlineAt: 1 };

describe("SupabaseRoomTransport lifecycle (fake client)", () => {
  test("StrictMode start → stop → start on one transport ends connected on a fresh channel", async () => {
    const { client, channels } = fakeClient();
    const t = new SupabaseRoomTransport("ABCD", client);
    const statuses: string[] = [];
    t.onStatus((s) => statuses.push(s));

    const first = t.connect(me);
    const stop = t.disconnect(); // cleanup runs before the first join even finished
    const second = t.connect(me); // remount
    await Promise.all([first.catch(() => {}), stop, second]);

    assert.equal(channels.length, 1, "exactly one live channel");
    assert.equal(channels[0]?.subscribed, true);
    assert.deepEqual(channels[0]?.tracked, me);
    assert.equal(statuses.at(-1), "connected");
  });

  test("send is dropped before join and delivered after; disconnect is idempotent", async () => {
    const { client, delivered } = fakeClient();
    const t = new SupabaseRoomTransport("WXYZ", client);
    const msg: NetworkMessage = createMessage("p1", { type: "test", text: "hi" });
    t.send(msg);
    await t.connect(me);
    t.send(msg);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.topic, "realtime:shoreline:room:WXYZ");
    await t.disconnect();
    await t.disconnect();
  });
});
