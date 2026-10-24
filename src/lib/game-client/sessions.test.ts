/**
 * Host ↔ player integration over the in-memory MockRoomTransport (same process, no network).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { engine } from "@/game/engine";
import { MockRoomTransport } from "@/lib/realtime/mock-transport";
import { HostSession } from "./host-session";
import { PlayerSession } from "./player-session";

const flush = () => new Promise((r) => setTimeout(r, 10));

async function setup(code: string, names: string[]) {
  const host = new HostSession({ roomCode: code, transport: new MockRoomTransport(code), engine });
  await host.start({ loop: false });
  const players: PlayerSession[] = [];
  for (const [i, name] of names.entries()) {
    const p = new PlayerSession({ transport: new MockRoomTransport(code), identity: { playerId: `p${i}`, name } });
    await p.start({ watchdog: false });
    players.push(p);
  }
  await flush();
  return { host, players };
}

describe("host + player sessions (mock transport)", () => {
  test("players joining get distinct roles in order", async () => {
    const { host, players } = await setup("TSTA", ["Ana", "Ben", "Cam", "Dee"]);
    const roles = host.store.get().room.players.map((p) => p.role);
    assert.deepEqual(roles, ["captain", "sonar", "weather", "radio"]);
    assert.equal(players[1]!.store.get().me?.role, "sonar");
    await host.stop();
  });

  test("after start, each player receives only its own role's view", async () => {
    const { host, players } = await setup("TSTB", ["Ana", "Ben"]);
    host.startMission();
    await flush();
    assert.equal(players[0]!.store.get().view?.role, "captain");
    assert.equal(players[1]!.store.get().view?.role, "sonar");
    assert.equal(host.store.get().room.status, "playing");
    await host.stop();
  });

  test("actions from the wrong role are rejected back to the sender", async () => {
    const { host, players } = await setup("TSTC", ["Ana", "Ben"]);
    host.startMission();
    await flush();
    players[1]!.sendAction({ type: "STEER", rudder: 1 }); // sonar can't steer
    await flush();
    assert.equal(players[1]!.store.get().lastRejection?.reason, "not_permitted");
    await host.stop();
  });

  test("a disconnected player keeps their role and is marked offline", async () => {
    const { host, players } = await setup("TSTD", ["Ana", "Ben"]);
    await players[0]!.stop();
    await flush();
    const ana = host.store.get().room.players.find((p) => p.id === "p0");
    assert.equal(ana?.connected, false);
    assert.equal(ana?.role, "captain");
    await host.stop();
  });
});
