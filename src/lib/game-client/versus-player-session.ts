/**
 * VERSUS PLAYER SESSION — one phone's connection to the 2v2 host. OWNER: Developer 2.
 *
 * Mirrors PlayerSession: typed actions out (with per-session seq numbers), versus_room /
 * versus_views / versus_events in. The phone keeps ONLY its own seat's view — the host sends every
 * seat's view in one bundle, and this is where the other three are dropped.
 *
 * The seat is never chosen here: it arrives in versus_room and the host is the only authority.
 */
import type { ActionRejectReason, NetworkMessage, PlayerAction } from "@/game/types";
import { NETWORK } from "@/game/config";
import type {
  MatchEvent,
  MatchScoreboard,
  VersusPlayer,
  VersusRoleView,
  VersusRoom,
} from "@/game/versus/contract";
import { createMessage, RecentIds, ViewOrderTracker, type MessageBody } from "@/lib/realtime/protocol";
import type { StoredIdentity } from "@/lib/realtime/player-identity";
import type { RoomTransport, TransportStatus } from "@/lib/realtime/transport";
import { Store } from "./store";

export interface VersusPlayerSnapshot {
  status: TransportStatus;
  error: string | null;
  room: VersusRoom | null;
  me: VersusPlayer | null;
  /** Only this seat's view. null while watching, or before the first bundle arrives. */
  view: VersusRoleView | null;
  scoreboard: MatchScoreboard | null;
  /** Wall-clock ms the last view arrived (for interpolation and staleness). */
  lastViewAt: number;
  recentEvents: MatchEvent[];
  lastRejection: { actionId: string; reason: ActionRejectReason } | null;
}

export interface VersusPlayerSessionOptions {
  transport: RoomTransport;
  identity: StoredIdentity;
  now?: () => number;
}

export class VersusPlayerSession {
  private seq = 0;
  private order = new ViewOrderTracker();
  private seen = new RecentIds();
  private unsubs: (() => void)[] = [];
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  readonly store = new Store<VersusPlayerSnapshot>({
    status: "idle",
    error: null,
    room: null,
    me: null,
    view: null,
    scoreboard: null,
    lastViewAt: 0,
    recentEvents: [],
    lastRejection: null,
  });

  constructor(private readonly opts: VersusPlayerSessionOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  get playerId(): string {
    return this.opts.identity.playerId;
  }

  async start({ watchdog = true }: { watchdog?: boolean } = {}): Promise<void> {
    const t = this.opts.transport;
    this.unsubs.push(
      t.onStatus((status, error) => {
        this.store.update((s) => ({ ...s, status, error: error ?? null }));
        // Every (re)connect re-announces us, so the host can hand back our seat.
        if (status === "connected") this.hello();
      }),
      t.onMessage((m) => this.handleMessage(m)),
    );
    await t.connect({ playerId: this.playerId, name: this.opts.identity.name, kind: "player", onlineAt: this.now() });
    this.hello();
    if (watchdog) {
      this.staleTimer = setInterval(() => {
        const s = this.store.get();
        if (s.room?.status === "playing" && this.now() - s.lastViewAt > NETWORK.staleAfterMs) this.hello();
      }, NETWORK.staleAfterMs);
    }
  }

  async stop(): Promise<void> {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    await this.opts.transport.disconnect();
  }

  /** Send a typed action to the host. Returns the actionId. */
  sendAction(action: PlayerAction): string {
    this.seq += 1;
    const actionId = `${this.playerId}:${this.seq}`;
    this.send({
      type: "action",
      envelope: { actionId, playerId: this.playerId, seq: this.seq, sentAt: this.now(), action },
    });
    return actionId;
  }

  private hello(): void {
    // A new hello resets the host's seq tracking for us, so restart our counter too.
    this.seq = 0;
    this.send({ type: "hello", playerId: this.playerId, name: this.opts.identity.name });
  }

  private handleMessage(m: NetworkMessage): void {
    if (!this.seen.add(m.msgId)) return;
    switch (m.type) {
      case "versus_room": {
        const me = m.room.players.find((p) => p.id === this.playerId) ?? null;
        this.store.update((s) => ({ ...s, room: m.room, me }));
        return;
      }
      case "versus_views": {
        const slot = this.store.get().me?.slot;
        if (!slot) return; // watching, or versus_room hasn't arrived yet
        if (!this.order.accept(m.matchId, m.tick)) return; // stale tick, or an old match
        const view = m.views[slot.team][slot.role];
        this.store.update((s) => ({ ...s, view, scoreboard: m.scoreboard, lastViewAt: this.now() }));
        return;
      }
      case "versus_events":
        this.store.update((s) => ({ ...s, recentEvents: [...s.recentEvents, ...m.events].slice(-20) }));
        return;
      case "action_rejected":
        if (m.actionId.startsWith(`${this.playerId}:`)) {
          this.store.update((s) => ({ ...s, lastRejection: { actionId: m.actionId, reason: m.reason } }));
        }
        return;
      default:
        return; // co-op room/views/events are not ours
    }
  }

  private send(body: MessageBody): void {
    this.opts.transport.send(createMessage(this.playerId, body, this.now()));
  }
}
