/**
 * HOST SESSION — the authoritative game loop, glued to a transport. OWNER: Developer 2.
 *
 *   player devices --action--> [transport] --> HostSession --applyAction/step--> engine
 *   HostSession --views bundle (10 Hz)--> [transport] --> player devices
 *
 * Responsibilities: lobby/roster from presence, role assignment, seq dedupe, fixed-step loop,
 * broadcasting views/events, answering `hello` (reconnect/resync).
 * NOT responsible for game rules — that's the engine (Developer 1).
 */
import { ROLES } from "@/game/types";
import type { GameEvent, GameState, NetworkMessage, PlayerAction, PresenceMeta, Role, Room, SpectatorView } from "@/game/types";
import { NETWORK, ROOM } from "@/game/config";
import type { GameEngine } from "@/game/engine";
import { createMessage, newId, RecentIds, SeqTracker, type MessageBody } from "@/lib/realtime/protocol";
import type { RoomTransport, TransportStatus } from "@/lib/realtime/transport";
import { Store } from "./store";

export interface HostSnapshot {
  status: TransportStatus;
  error: string | null;
  room: Room;
  spectator: SpectatorView;
  /** Recent events for host-side effects (newest last, capped). */
  recentEvents: GameEvent[];
}

export interface HostSessionOptions {
  roomCode: string;
  transport: RoomTransport;
  engine: GameEngine;
  hostId?: string;
  /** Injectable clock for tests. */
  now?: () => number;
}

export class HostSession {
  readonly hostId: string;
  private state: GameState;
  private room: Room;
  private seq = new SeqTracker();
  private seen = new RecentIds();
  private pendingEvents: GameEvent[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubs: (() => void)[] = [];
  private lastStepAt = 0;
  private accumulator = 0;
  private readonly now: () => number;
  readonly store: Store<HostSnapshot>;

  constructor(private readonly opts: HostSessionOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.hostId = opts.hostId ?? `host-${newId()}`;
    this.state = opts.engine.createInitialState({ seed: 1, gameId: newId() });
    this.room = { code: opts.roomCode, hostId: this.hostId, players: [], status: "lobby", createdAt: 0 };
    this.store = new Store<HostSnapshot>({
      status: "idle",
      error: null,
      room: this.room,
      spectator: opts.engine.getSpectatorView(this.state),
      recentEvents: [],
    });
  }

  /** Connect and (by default) start the simulation + broadcast loops. */
  async start({ loop = true }: { loop?: boolean } = {}): Promise<void> {
    const t = this.opts.transport;
    this.room = { ...this.room, createdAt: this.now() };
    this.unsubs.push(
      t.onStatus((status, error) => this.store.update((s) => ({ ...s, status, error: error ?? null }))),
      t.onPresence((members) => this.handlePresence(members)),
      t.onMessage((m) => this.handleMessage(m)),
    );
    const me: PresenceMeta = { playerId: this.hostId, name: "Host", kind: "host", onlineAt: this.now() };
    await t.connect(me);
    this.publish();
    if (loop) {
      this.lastStepAt = this.now();
      this.timers.push(setInterval(() => this.runFrame(), 1000 / NETWORK.simHz));
      this.timers.push(setInterval(() => this.broadcastViews(), 1000 / NETWORK.viewBroadcastHz));
    }
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    await this.opts.transport.disconnect();
  }

  // ---------------- host controls (called by the host UI) ----------------

  startMission(): void {
    const fresh = this.opts.engine.createInitialState({ seed: Math.floor(this.now() % 1e9), gameId: newId() });
    this.state = fresh;
    this.applyFromHost({ type: "START_GAME" });
    this.setRoom({ ...this.room, status: "playing" });
    this.broadcastViews();
  }

  resetMission(): void {
    this.state = this.opts.engine.createInitialState({ seed: 1, gameId: newId() });
    this.setRoom({ ...this.room, status: "lobby" });
    this.broadcastViews();
  }

  assignRole(playerId: string, role: Role | null): void {
    const players = this.room.players.map((p) => {
      if (p.id === playerId) return { ...p, role };
      if (role !== null && p.role === role) return { ...p, role: null }; // swap out the previous holder
      return p;
    });
    this.setRoom({ ...this.room, players });
  }

  /** Advance the simulation manually (tests, or a paused/debug host). */
  tick(dtMs: number = 1000 / NETWORK.simHz): void {
    const r = this.opts.engine.step(this.state, dtMs);
    this.state = r.state;
    this.pendingEvents.push(...r.events);
    this.checkEnded();
  }

  getState(): GameState {
    return this.state;
  }

  get transportKind(): RoomTransport["kind"] {
    return this.opts.transport.kind;
  }

  // ---------------- internals ----------------

  private runFrame(): void {
    const now = this.now();
    // Real elapsed time in fixed steps, so a slow frame doesn't slow the game clock.
    this.accumulator += Math.min(500, now - this.lastStepAt);
    this.lastStepAt = now;
    const dt = 1000 / NETWORK.simHz;
    while (this.accumulator >= dt) {
      this.tick(dt);
      this.accumulator -= dt;
    }
    this.publish();
  }

  private applyFromHost(action: PlayerAction): void {
    const r = this.opts.engine.applyAction(this.state, action, "host");
    this.state = r.state;
    this.pendingEvents.push(...r.events);
  }

  private checkEnded(): void {
    const phase = this.state.mission.phase;
    if ((phase === "victory" || phase === "failure") && this.room.status === "playing") {
      this.setRoom({ ...this.room, status: "ended" });
    }
  }

  private handlePresence(members: PresenceMeta[]): void {
    const online = new Map(members.filter((m) => m.kind === "player").map((m) => [m.playerId, m]));
    let players = this.room.players.map((p) => ({ ...p, connected: online.has(p.id) }));
    for (const [id, meta] of online) {
      if (players.some((p) => p.id === id)) continue;
      if (players.length >= ROOM.maxPlayers) continue; // extra devices can watch but get no role
      const taken = new Set(players.map((p) => p.role));
      const role = ROLES.find((r) => !taken.has(r)) ?? null;
      players = [...players, { id, name: meta.name, role, connected: true, joinedAt: this.now() }];
    }
    this.setRoom({ ...this.room, players });
  }

  private handleMessage(m: NetworkMessage): void {
    if (!this.seen.add(m.msgId)) return;
    switch (m.type) {
      case "hello": {
        this.seq.resetPlayer(m.playerId);
        const players = this.room.players.map((p) => (p.id === m.playerId ? { ...p, name: m.name } : p));
        this.setRoom({ ...this.room, players });
        this.broadcastViews();
        return;
      }
      case "action": {
        const env = m.envelope;
        if (env.playerId !== m.from) return;
        if (!this.seq.accept(env.playerId, env.seq)) return;
        const role = this.room.players.find((p) => p.id === env.playerId)?.role ?? null;
        const r = this.opts.engine.applyAction(this.state, env.action, role);
        if (r.rejected) {
          this.send({ type: "action_rejected", actionId: env.actionId, reason: r.rejected });
          return;
        }
        this.state = r.state;
        this.pendingEvents.push(...r.events);
        return;
      }
      default:
        return; // host ignores room/views/events/test from others
    }
  }

  private setRoom(room: Room): void {
    this.room = room;
    this.send({ type: "room", room });
    this.publish();
  }

  private broadcastViews(): void {
    const { gameId, tick } = this.state;
    this.send({ type: "views", gameId, tick, views: this.opts.engine.getRoleViews(this.state) });
    if (this.pendingEvents.length > 0) {
      this.send({ type: "events", gameId, tick, events: this.pendingEvents });
      this.store.update((s) => ({ ...s, recentEvents: [...s.recentEvents, ...this.pendingEvents].slice(-20) }));
      this.pendingEvents = [];
    }
  }

  private send(body: MessageBody): void {
    this.opts.transport.send(createMessage(this.hostId, body, this.now()));
  }

  private publish(): void {
    this.store.update((s) => ({ ...s, room: this.room, spectator: this.opts.engine.getSpectatorView(this.state) }));
  }
}
