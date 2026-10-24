/**
 * SUPABASE REALTIME TRANSPORT. OWNER: Developer 2.
 *
 * One public Realtime channel per room (`stormline:room:<CODE>`), one broadcast event ("msg")
 * carrying a NetworkMessage, and Presence keyed by playerId. No tables, no auth.
 * See docs/CONTRACTS.md §5 and docs/DEPLOY.md "Supabase Realtime".
 *
 * Status mapping (Realtime → TransportStatus):
 *   SUBSCRIBED                 → "connected"   (also on automatic rejoin after a network blip —
 *                                               PlayerSession re-sends `hello` on every "connected")
 *   CHANNEL_ERROR / TIMED_OUT  → "error"       (realtime-js keeps retrying in the background)
 *   CLOSED                     → "disconnected"
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { NetworkMessage, PresenceMeta } from "@/game/types";
import { isNetworkMessage } from "./protocol";
import { channelName } from "./room-code";
import { createSupabaseClient } from "./supabase-client";
import type { RoomTransport, TransportStatus, Unsubscribe } from "./transport";

const EVENT = "msg";

function isPresenceMeta(value: unknown): value is PresenceMeta {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.playerId === "string" &&
    typeof m.name === "string" &&
    (m.kind === "host" || m.kind === "player") &&
    typeof m.onlineAt === "number"
  );
}

/**
 * presenceState() is `{ [key]: Array<meta & { presence_ref }> }` — one entry per connection that
 * tracked that key (e.g. the same player open in two tabs). Collapse to one member per playerId,
 * keeping the most recent, and strip Supabase's own fields.
 */
export function flattenPresence(state: Record<string, unknown[]>): PresenceMeta[] {
  const members: PresenceMeta[] = [];
  for (const entries of Object.values(state)) {
    let latest: PresenceMeta | null = null;
    for (const entry of entries) {
      if (!isPresenceMeta(entry)) continue;
      if (!latest || entry.onlineAt >= latest.onlineAt) {
        latest = { playerId: entry.playerId, name: entry.name, kind: entry.kind, onlineAt: entry.onlineAt };
      }
    }
    if (latest) members.push(latest);
  }
  return members.sort((a, b) => a.onlineAt - b.onlineAt);
}

export class SupabaseRoomTransport implements RoomTransport {
  readonly kind = "supabase" as const;
  private channel: RealtimeChannel | null = null;
  private joined = false;
  private closing = false;
  private messageHandlers = new Set<(m: NetworkMessage) => void>();
  private presenceHandlers = new Set<(members: PresenceMeta[]) => void>();
  private statusHandlers = new Set<(s: TransportStatus, e?: string) => void>();
  private readonly client: SupabaseClient;
  private readonly ownsClient: boolean;

  /** Pass a client only in tests; by default each transport owns its own (see supabase-client.ts). */
  constructor(
    readonly roomCode: string,
    client?: SupabaseClient,
  ) {
    this.client = client ?? createSupabaseClient();
    this.ownsClient = !client;
  }

  connect(me: PresenceMeta): Promise<void> {
    if (this.channel) return Promise.resolve();
    this.closing = false;
    this.emitStatus("connecting");

    const channel = this.client.channel(channelName(this.roomCode), {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.playerId } },
    });
    this.channel = channel;

    channel.on("broadcast", { event: EVENT }, ({ payload }) => {
      // Never trust the wire: anything that isn't a well-formed NetworkMessage is dropped.
      if (!isNetworkMessage(payload)) return;
      for (const h of this.messageHandlers) h(payload);
    });

    channel.on("presence", { event: "sync" }, () => {
      const members = flattenPresence(channel.presenceState() as Record<string, unknown[]>);
      for (const h of this.presenceHandlers) h(members);
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      channel.subscribe(async (status, err) => {
        if (this.channel !== channel) return; // stale callback after disconnect()
        switch (status) {
          case "SUBSCRIBED": {
            this.joined = true;
            // Re-track on every (re)subscribe so presence survives automatic rejoins.
            const result = await channel.track(me);
            if (result !== "ok") console.warn(`[stormline] presence track returned "${result}"`);
            this.emitStatus("connected");
            if (!settled) {
              settled = true;
              resolve();
            }
            return;
          }
          case "CHANNEL_ERROR":
          case "TIMED_OUT": {
            this.joined = false;
            const message =
              status === "TIMED_OUT"
                ? "Timed out joining the room channel. Check your connection."
                : `Realtime channel error${err?.message ? `: ${err.message}` : ""}. Retrying…`;
            this.emitStatus("error", message);
            if (!settled) {
              settled = true;
              reject(new Error(message));
            }
            return;
          }
          case "CLOSED": {
            this.joined = false;
            // disconnect() emits its own "disconnected"; only report unexpected closes here.
            if (!this.closing) this.emitStatus("disconnected");
            if (!settled) {
              settled = true;
              reject(new Error("Realtime channel closed before joining."));
            }
            return;
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    this.closing = true;
    this.channel = null;
    this.joined = false;
    try {
      await channel.untrack();
    } catch {
      // Socket may already be gone (tab closing, offline) — the server drops presence anyway.
    }
    try {
      await this.client.removeChannel(channel);
      if (this.ownsClient) this.client.realtime.disconnect();
    } catch {
      // Best effort; nothing useful to do if teardown fails.
    }
    this.emitStatus("disconnected");
  }

  send(message: NetworkMessage): void {
    // Drop (like the mock) when not joined. Sending on an unjoined channel would make supabase-js
    // silently fall back to an HTTP request, which we don't want for 10 Hz traffic.
    if (!this.channel || !this.joined) return;
    this.channel.send({ type: "broadcast", event: EVENT, payload: message }).catch((e: unknown) => {
      console.warn("[stormline] broadcast failed", e);
    });
  }

  onMessage(handler: (m: NetworkMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPresence(handler: (members: PresenceMeta[]) => void): Unsubscribe {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  onStatus(handler: (s: TransportStatus, e?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private emitStatus(s: TransportStatus, e?: string): void {
    for (const h of this.statusHandlers) h(s, e);
  }
}
