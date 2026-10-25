/**
 * VERSUS HOST SESSION — the authoritative 2v2 match loop, glued to a transport. OWNER: Developer 2.
 *
 *   phones --action--> [transport] --> VersusHostSession --applyAction/step--> versusEngine
 *   VersusHostSession --versus_views (10 Hz)--> [transport] --> phones
 *
 * Mirrors HostSession (proven co-op code) with three differences:
 *   - it holds ONE VersusMatchState containing both teams' worlds, so the shared clock is automatic:
 *     a single engine.step() advances blue and red by the same dtMs;
 *   - players hold a seat (team + role) from SLOT_ORDER instead of a co-op role;
 *   - it speaks versus_room / versus_views / versus_events.
 *
 * NOT responsible for game rules — that's versusEngine (Developer 1).
 */
import type { NetworkMessage, PresenceMeta } from "@/game/types";
import { NETWORK } from "@/game/config";
import type {
  MatchEvent,
  PlayerTeamAssignment,
  SpectatorMatchView,
  VersusEngine,
  VersusMatchState,
  VersusPlayer,
  VersusRoom,
} from "@/game/versus/contract";
import { SLOT_ORDER } from "@/game/versus/contract";
import { createMessage, newId, RecentIds, SeqTracker, type MessageBody } from "@/lib/realtime/protocol";
import type { RoomTransport, TransportStatus } from "@/lib/realtime/transport";
import { Store } from "./store";

export interface VersusHostSnapshot {
  status: TransportStatus;
  error: string | null;
  room: VersusRoom;
  spectator: SpectatorMatchView;
  /** Recent match events for host-side effects (newest last, capped). */
  recentEvents: MatchEvent[];
}

export interface VersusHostSessionOptions {
  roomCode: string;
  transport: RoomTransport;
  engine: VersusEngine;
  hostId?: string;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Seats compare by value, not identity — SLOT_ORDER entries are frozen literals. */
function slotKey(slot: PlayerTeamAssignment): string {
  return `${slot.team}:${slot.role}`;
}

function sameSlot(a: PlayerTeamAssignment | null, b: PlayerTeamAssignment | null): boolean {
  if (a === null || b === null) return a === b;
  return a.team === b.team && a.role === b.role;
}

export class VersusHostSession {
  readonly hostId: string;
  private match: VersusMatchState;
  private room: VersusRoom;
  private seq = new SeqTracker();
  private seen = new RecentIds();
  private pendingEvents: MatchEvent[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubs: (() => void)[] = [];
  private lastStepAt = 0;
  private accumulator = 0;
  private readonly now: () => number;
  readonly store: Store<VersusHostSnapshot>;

  constructor(private readonly opts: VersusHostSessionOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.hostId = opts.hostId ?? `host-${newId()}`;
    this.match = opts.engine.createMatch({ seed: 1, matchId: newId() });
    this.room = { code: opts.roomCode, hostId: this.hostId, players: [], status: "lobby", createdAt: 0 };
    this.store = new Store<VersusHostSnapshot>({
      status: "idle",
      error: null,
      room: this.room,
      spectator: opts.engine.getSpectatorView(this.match),
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

  /** Fresh seed every match, shared by both worlds, then briefing → countdown. */
  startMatch(): void {
    const fresh = this.opts.engine.createMatch({ seed: Math.floor(this.now() % 1e9), matchId: newId() });
    const r = this.opts.engine.startMatch(fresh);
    this.match = r.match;
    this.pendingEvents.push(...r.events);
    this.setRoom({ ...this.room, status: "playing" });
    this.broadcastViews();
  }

  resetMatch(): void {
    this.match = this.opts.engine.createMatch({ seed: 1, matchId: newId() });
    this.pendingEvents = [];
    this.setRoom({ ...this.room, status: "lobby" });
    this.broadcastViews();
  }

  /**
   * Seat a player. If someone else already holds `slot`, they take the mover's old seat, so a seat
   * is never held twice (and nobody is silently benched). `null` unseats.
   */
  assignSlot(playerId: string, slot: PlayerTeamAssignment | null): void {
    const mover = this.room.players.find((p) => p.id === playerId);
    if (!mover) return;
    const vacated = mover.slot;
    const players = this.room.players.map((p) => {
      if (p.id === playerId) return { ...p, slot };
      if (slot !== null && sameSlot(p.slot, slot)) return { ...p, slot: vacated };
      return p;
    });
    this.setRoom({ ...this.room, players });
  }

  /** Advance the match manually (tests, or a paused/debug host). Both worlds move together. */
  tick(dtMs: number = 1000 / NETWORK.simHz): void {
    const r = this.opts.engine.step(this.match, dtMs);
    this.match = r.match;
    this.pendingEvents.push(...r.events);
    this.checkEnded();
  }

  /** Push views now. The loop does this at viewBroadcastHz; manual/debug hosts and tests call it. */
  broadcast(): void {
    this.broadcastViews();
  }

  getMatch(): VersusMatchState {
    return this.match;
  }

  get transportKind(): RoomTransport["kind"] {
    return this.opts.transport.kind;
  }

  // ---------------- internals ----------------

  private runFrame(): void {
    const now = this.now();
    // Real elapsed time in fixed steps, so a slow frame doesn't slow the match clock.
    this.accumulator += Math.min(500, now - this.lastStepAt);
    this.lastStepAt = now;
    const dt = 1000 / NETWORK.simHz;
    while (this.accumulator >= dt) {
      this.tick(dt);
      this.accumulator -= dt;
    }
    this.publish();
  }

  private checkEnded(): void {
    if (this.match.phase === "ended" && this.room.status === "playing") {
      this.setRoom({ ...this.room, status: "ended" });
    }
  }

  private handlePresence(members: PresenceMeta[]): void {
    const online = new Map(members.filter((m) => m.kind === "player").map((m) => [m.playerId, m]));
    // Known ids keep their seat; presence only moves them online/offline.
    let players: VersusPlayer[] = this.room.players.map((p) => ({ ...p, connected: online.has(p.id) }));
    for (const [id, meta] of online) {
      if (players.some((p) => p.id === id)) continue;
      const taken = new Set(players.flatMap((p) => (p.slot ? [slotKey(p.slot)] : [])));
      // Extra phones past the four seats still join the roster, so they can show "watching".
      const slot = SLOT_ORDER.find((s) => !taken.has(slotKey(s))) ?? null;
      players = [...players, { id, name: meta.name, slot, connected: true, joinedAt: this.now() }];
    }
    this.setRoom({ ...this.room, players });
  }

  private handleMessage(m: NetworkMessage): void {
    if (!this.seen.add(m.msgId)) return;
    switch (m.type) {
      case "hello": {
        this.seq.resetPlayer(m.playerId);
        const players = this.room.players.map((p) => (p.id === m.playerId ? { ...p, name: m.name } : p));
        this.setRoom({ ...this.room, players }); // sends versus_room
        this.broadcastViews();
        return;
      }
      case "action": {
        const env = m.envelope;
        if (env.playerId !== m.from) return; // spoofed sender
        if (!this.seq.accept(env.playerId, env.seq)) return; // replay / out of order
        // The seat comes from OUR roster, never from the payload.
        const slot = this.room.players.find((p) => p.id === env.playerId)?.slot ?? null;
        if (!slot) {
          this.send({ type: "action_rejected", actionId: env.actionId, reason: "unknown_player" });
          return;
        }
        const r = this.opts.engine.applyAction(this.match, slot, env.action);
        if (r.rejected) {
          this.send({ type: "action_rejected", actionId: env.actionId, reason: r.rejected });
          return;
        }
        this.match = r.match;
        this.pendingEvents.push(...r.events);
        return;
      }
      default:
        return; // host ignores room/views/events/test from others
    }
  }

  private setRoom(room: VersusRoom): void {
    this.room = room;
    this.send({ type: "versus_room", room });
    this.publish();
  }

  private broadcastViews(): void {
    const m = this.match;
    this.send({
      type: "versus_views",
      matchId: m.matchId,
      tick: m.tick,
      scoreboard: this.opts.engine.getScoreboard(m),
      views: this.opts.engine.getViews(m),
    });
    if (this.pendingEvents.length > 0) {
      const events = this.pendingEvents;
      this.pendingEvents = [];
      this.send({ type: "versus_events", matchId: m.matchId, tick: m.tick, events });
      this.store.update((s) => ({ ...s, recentEvents: [...s.recentEvents, ...events].slice(-20) }));
    }
  }

  private send(body: MessageBody): void {
    this.opts.transport.send(createMessage(this.hostId, body, this.now()));
  }

  private publish(): void {
    this.store.update((s) => ({
      ...s,
      room: this.room,
      spectator: this.opts.engine.getSpectatorView(this.match),
    }));
  }
}
