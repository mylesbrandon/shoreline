/**
 * PLAYER SESSION — a phone's connection to the host. OWNER: Developer 2.
 *
 * Sends typed actions (with per-session seq numbers), receives the room roster and the views
 * bundle, keeps only its own role's view, and re-sends `hello` if views go stale (resync).
 */
import type { ActionRejectReason, GameEvent, NetworkMessage, Player, PlayerAction, RoleViewState, Room } from "@/game/types";
import { NETWORK } from "@/game/config";
import { createMessage, RecentIds, ViewOrderTracker, type MessageBody } from "@/lib/realtime/protocol";
import type { RoomTransport, TransportStatus } from "@/lib/realtime/transport";
import type { StoredIdentity } from "@/lib/realtime/player-identity";
import { Store } from "./store";

export interface PlayerSnapshot {
  status: TransportStatus;
  error: string | null;
  room: Room | null;
  me: Player | null;
  view: RoleViewState | null;
  /** Wall-clock ms the last view arrived (for interpolation and staleness). */
  lastViewAt: number;
  recentEvents: GameEvent[];
  lastRejection: { actionId: string; reason: ActionRejectReason } | null;
}

export interface PlayerSessionOptions {
  transport: RoomTransport;
  identity: StoredIdentity;
  now?: () => number;
}

export class PlayerSession {
  private seq = 0;
  private order = new ViewOrderTracker();
  private seen = new RecentIds();
  private unsubs: (() => void)[] = [];
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  readonly store = new Store<PlayerSnapshot>({
    status: "idle",
    error: null,
    room: null,
    me: null,
    view: null,
    lastViewAt: 0,
    recentEvents: [],
    lastRejection: null,
  });

  constructor(private readonly opts: PlayerSessionOptions) {
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

  sendTest(text: string): void {
    this.send({ type: "test", text });
  }

  private hello(): void {
    // A new hello resets the host's seq tracking for us, so restart our counter too.
    this.seq = 0;
    this.send({ type: "hello", playerId: this.playerId, name: this.opts.identity.name });
  }

  private handleMessage(m: NetworkMessage): void {
    if (!this.seen.add(m.msgId)) return;
    switch (m.type) {
      case "room": {
        const me = m.room.players.find((p) => p.id === this.playerId) ?? null;
        this.store.update((s) => ({ ...s, room: m.room, me }));
        return;
      }
      case "views": {
        const role = this.store.get().me?.role;
        if (!role) return;
        const view = m.views[role];
        if (!view || !this.order.accept(m.gameId, m.tick)) return;
        this.store.update((s) => ({ ...s, view, lastViewAt: this.now() }));
        return;
      }
      case "events":
        this.store.update((s) => ({ ...s, recentEvents: [...s.recentEvents, ...m.events].slice(-20) }));
        return;
      case "action_rejected":
        if (m.actionId.startsWith(`${this.playerId}:`)) {
          this.store.update((s) => ({ ...s, lastRejection: { actionId: m.actionId, reason: m.reason } }));
        }
        return;
      default:
        return;
    }
  }

  private send(body: MessageBody): void {
    this.opts.transport.send(createMessage(this.playerId, body, this.now()));
  }
}
