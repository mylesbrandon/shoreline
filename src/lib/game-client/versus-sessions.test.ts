/**
 * Versus host ↔ phone integration over the in-memory MockRoomTransport (same process, no network).
 * Mirrors sessions.test.ts. Everything is driven by manual ticks, so there are no real timers.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { versusEngine } from "@/game/engine";
import { SLOT_ORDER, VERSUS } from "@/game/versus/contract";
import type { PlayerTeamAssignment } from "@/game/versus/contract";
import type { NetworkMessage } from "@/game/types";
import { NETWORK } from "@/game/config";
import { MockRoomTransport } from "@/lib/realtime/mock-transport";
import { createMessage } from "@/lib/realtime/protocol";
import { VersusHostSession } from "./versus-host-session";
import { VersusPlayerSession } from "./versus-player-session";
import { waitFor } from "./wait-for";

const flush = () => new Promise((r) => setTimeout(r, 10));
const DT = 1000 / NETWORK.simHz;

async function setup(code: string, names: string[]) {
  const host = new VersusHostSession({ roomCode: code, transport: new MockRoomTransport(code), engine: versusEngine });
  await host.start({ loop: false });
  const players: VersusPlayerSession[] = [];
  for (const [i, name] of names.entries()) {
    const p = new VersusPlayerSession({ transport: new MockRoomTransport(code), identity: { playerId: `p${i}`, name } });
    await p.start({ watchdog: false });
    players.push(p);
  }
  // Every phone listed by the host, and every phone has heard back about its seat.
  await waitFor(
    () => host.store.get().room.players.length === names.length && players.every((p) => p.store.get().me !== null),
    `${names.length} players joined and seated`,
  );
  return { host, players };
}

/** Tick past the 3 s countdown so the match is "active". */
function tickPastCountdown(host: VersusHostSession): void {
  for (let t = 0; t <= VERSUS.countdownMs; t += DT) host.tick(DT);
}

const seatOf = (host: VersusHostSession, id: string): PlayerTeamAssignment | null =>
  host.store.get().room.players.find((p) => p.id === id)?.slot ?? null;

describe("versus host + phone sessions (mock transport)", () => {
  test("four joins fill SLOT_ORDER; a fifth watches and its actions are rejected", async () => {
    const { host, players } = await setup("VSA", ["Ana", "Ben", "Cam", "Dee", "Eli"]);
    const slots = host.store.get().room.players.slice(0, 4).map((p) => p.slot);
    assert.deepEqual(slots, [...SLOT_ORDER]);

    const fifth = host.store.get().room.players[4];
    assert.equal(fifth?.id, "p4");
    assert.equal(fifth?.slot, null, "fifth phone is seatless");
    assert.equal(players[4]!.store.get().me?.slot ?? null, null, "and knows it is watching");

    host.startMatch();
    tickPastCountdown(host);
    players[4]!.sendAction({ type: "STEER", rudder: 1 });
    await waitFor(() => players[4]!.store.get().lastRejection !== null, "the fifth phone's rejection");
    assert.equal(players[4]!.store.get().lastRejection?.reason, "unknown_player");
    await host.stop();
  });

  test("assignSlot swaps, so a seat is never held twice", async () => {
    const { host } = await setup("VSB", ["Ana", "Ben", "Cam", "Dee"]);
    // p0 is blue captain, p1 is red captain. Move p0 onto red captain.
    host.assignSlot("p0", { team: "red", role: "captain" });
    await flush();
    assert.deepEqual(seatOf(host, "p0"), { team: "red", role: "captain" });
    assert.deepEqual(seatOf(host, "p1"), { team: "blue", role: "captain" }, "displaced player takes the vacated seat");

    const keys = host.store
      .get()
      .room.players.flatMap((p) => (p.slot ? [`${p.slot.team}:${p.slot.role}`] : []));
    assert.equal(new Set(keys).size, keys.length, "all seats unique");

    host.assignSlot("p0", null);
    await flush();
    assert.equal(seatOf(host, "p0"), null);
    await host.stop();
  });

  test("after the countdown each phone gets only its own seat's view", async () => {
    const { host, players } = await setup("VSC", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);
    host.broadcast();
    await flush();

    const seats = players.map((p) => p.store.get().view);
    assert.deepEqual(
      seats.map((v) => v && { role: v.role, team: v.team }),
      [
        { role: "captain", team: "blue" },
        { role: "captain", team: "red" },
        { role: "navigator", team: "blue" },
        { role: "navigator", team: "red" },
      ],
    );
    assert.equal(host.getMatch().phase, "active");
    assert.equal(players[0]!.store.get().scoreboard?.phase, "active");
    await host.stop();
  });

  test("the blue captain's throttle moves blue only", async () => {
    const { host, players } = await setup("VSD", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);
    players[0]!.sendAction({ type: "SET_THROTTLE", throttle: 1 });
    await flush();
    for (let i = 0; i < 20; i++) host.tick(DT);

    const m = host.getMatch();
    assert.ok(m.teams.blue.state.boat.speed > 0, "blue is moving");
    assert.equal(m.teams.red.state.boat.speed, 0, "red is untouched");
    await host.stop();
  });

  test("seat permissions: navigator can't STEER, captain can't START_GAME", async () => {
    const { host, players } = await setup("VSE", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);

    players[2]!.sendAction({ type: "STEER", rudder: 1 }); // blue navigator
    await flush();
    assert.equal(players[2]!.store.get().lastRejection?.reason, "not_permitted");
    assert.equal(players[0]!.store.get().lastRejection, null, "rejection went only to the sender");

    players[0]!.sendAction({ type: "START_GAME" }); // blue captain
    await flush();
    assert.equal(players[0]!.store.get().lastRejection?.reason, "not_permitted");
    await host.stop();
  });

  test("a duplicate msgId is applied once and a stale seq is dropped", async () => {
    const { host } = await setup("VSF", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);

    // Speak for p0 (blue captain) on a raw transport so we control msgId and seq.
    const wire = new MockRoomTransport("VSF");
    await wire.connect({ playerId: "spoof", name: "wire", kind: "host", onlineAt: 0 });
    const send = (m: NetworkMessage) => wire.send(m);

    const first = createMessage("p0", {
      type: "action",
      envelope: { actionId: "p0:1", playerId: "p0", seq: 1, sentAt: 0, action: { type: "SET_THROTTLE", throttle: 1 } },
    });
    send(first);
    await flush();
    assert.equal(host.getMatch().teams.blue.state.boat.throttle, 1);

    // Same msgId, different seq and payload: RecentIds must drop it before seq is even consulted.
    send({ ...first, envelope: { actionId: "p0:2", playerId: "p0", seq: 2, sentAt: 0, action: { type: "SET_THROTTLE", throttle: 0 } } } as NetworkMessage);
    await flush();
    assert.equal(host.getMatch().teams.blue.state.boat.throttle, 1, "duplicate msgId ignored");

    // Fresh msgId but a seq we've already passed: dropped by SeqTracker.
    send(createMessage("p0", {
      type: "action",
      envelope: { actionId: "p0:1b", playerId: "p0", seq: 1, sentAt: 0, action: { type: "SET_THROTTLE", throttle: 0 } },
    }));
    await flush();
    assert.equal(host.getMatch().teams.blue.state.boat.throttle, 1, "stale seq ignored");

    await wire.disconnect();
    await host.stop();
  });

  test("a phone ignores a versus_views bundle older than the one it has", async () => {
    const { host, players } = await setup("VSG", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);
    host.broadcast();
    await flush();

    const m = host.getMatch();
    const seen = players[0]!.store.get().scoreboard;
    assert.ok(seen && m.tick > 1);

    const wire = new MockRoomTransport("VSG");
    await wire.connect({ playerId: "spoof", name: "wire", kind: "host", onlineAt: 0 });
    wire.send(createMessage(host.hostId, {
      type: "versus_views",
      matchId: m.matchId,
      tick: m.tick - 1, // older than what the phone already rendered
      scoreboard: { ...versusEngine.getScoreboard(m), elapsedMs: 999_999 },
      views: versusEngine.getViews(m),
    }));
    await flush();
    assert.notEqual(players[0]!.store.get().scoreboard?.elapsedMs, 999_999, "stale tick ignored");

    await wire.disconnect();
    await host.stop();
  });

  test("a phone that reconnects with the same id keeps its seat and resumes views", async () => {
    const { host, players } = await setup("VSH", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);

    await players[1]!.stop(); // red captain drops
    await flush();
    const offline = host.store.get().room.players.find((p) => p.id === "p1");
    assert.equal(offline?.connected, false);
    assert.deepEqual(offline?.slot, { team: "red", role: "captain" }, "seat kept while offline");

    const again = new VersusPlayerSession({
      transport: new MockRoomTransport("VSH"),
      identity: { playerId: "p1", name: "Ben" },
    });
    await again.start({ watchdog: false });
    await flush();

    assert.deepEqual(again.store.get().me?.slot, { team: "red", role: "captain" }, "same seat back");
    assert.equal(again.store.get().view?.role, "captain", "views resumed after hello");
    assert.equal(again.store.get().view?.team, "red");
    await again.stop();
    await host.stop();
  });

  test("resetMatch issues a new matchId that phones accept", async () => {
    const { host, players } = await setup("VSI", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);
    host.broadcast();
    await flush();
    const firstId = players[0]!.store.get().scoreboard?.matchId;
    assert.ok(firstId);

    host.resetMatch();
    await flush();
    const afterReset = players[0]!.store.get().scoreboard?.matchId;
    assert.notEqual(afterReset, firstId, "phones took the new match");
    assert.equal(host.store.get().room.status, "lobby");

    // And a new match still starts cleanly without any reload.
    host.startMatch();
    tickPastCountdown(host);
    host.broadcast();
    await flush();
    assert.equal(players[0]!.store.get().scoreboard?.phase, "active");
    await host.stop();
  });

  test("full match: ticking to matchDurationMs ends it everywhere with the same result", async () => {
    const { host, players } = await setup("VSJ", ["Ana", "Ben", "Cam", "Dee"]);
    host.startMatch();
    tickPastCountdown(host);
    for (let t = 0; t <= VERSUS.matchDurationMs; t += DT) host.tick(DT);
    host.broadcast();
    await flush();

    const m = host.getMatch();
    assert.equal(m.phase, "ended");
    assert.equal(host.store.get().room.status, "ended");
    assert.ok(m.result, "engine set a result");

    for (const p of players) {
      const sb = p.store.get().scoreboard;
      assert.equal(sb?.phase, "ended", "every phone sees the end");
      assert.deepEqual(sb?.result, m.result, "and the same result as the host");
    }
    await host.stop();
  });
});
