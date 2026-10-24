/**
 * SUPABASE REALTIME TRANSPORT — skeleton. OWNER: Developer 2 (this is your FIRST TASK).
 *
 * Implementation notes (see docs/CONTRACTS.md "Transport" and docs/DEPLOY.md "Supabase"):
 *
 *   const channel = client.channel(channelName(roomCode), {
 *     config: { broadcast: { self: false, ack: false }, presence: { key: me.playerId } },
 *   });
 *   channel.on("broadcast", { event: "msg" }, ({ payload }) => { if (isNetworkMessage(payload)) emit(payload) });
 *   channel.on("presence", { event: "sync" }, () => emitPresence(flatten(channel.presenceState())));
 *   channel.subscribe(async (status) => {
 *     if (status === "SUBSCRIBED") { await channel.track(me); resolve(); }
 *     if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emitStatus("error", ...);
 *     if (status === "CLOSED") emitStatus("disconnected");
 *   });
 *   send:       channel.send({ type: "broadcast", event: "msg", payload: message })
 *   disconnect: await channel.untrack(); await client.removeChannel(channel);
 *
 * Use one broadcast event name ("msg") and route on NetworkMessage.type.
 * No database tables are needed — Broadcast and Presence work on the public anon/publishable key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NetworkMessage, PresenceMeta } from "@/game/types";
import type { RoomTransport, TransportStatus, Unsubscribe } from "./transport";

const NOT_IMPLEMENTED =
  "SupabaseRoomTransport is not implemented yet (Developer 2, first task). " +
  "To use mock mode instead, remove NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.";

export class SupabaseRoomTransport implements RoomTransport {
  readonly kind = "supabase" as const;
  private statusHandlers = new Set<(s: TransportStatus, e?: string) => void>();

  constructor(
    readonly roomCode: string,
    private readonly client: SupabaseClient,
  ) {}

  async connect(me: PresenceMeta): Promise<void> {
    void me;
    void this.client;
    for (const h of this.statusHandlers) h("error", NOT_IMPLEMENTED);
    throw new Error(NOT_IMPLEMENTED);
  }

  async disconnect(): Promise<void> {
    // TODO(dev2)
  }

  send(message: NetworkMessage): void {
    void message;
    // TODO(dev2)
  }

  onMessage(handler: (m: NetworkMessage) => void): Unsubscribe {
    void handler;
    // TODO(dev2)
    return () => {};
  }

  onPresence(handler: (members: PresenceMeta[]) => void): Unsubscribe {
    void handler;
    // TODO(dev2)
    return () => {};
  }

  onStatus(handler: (s: TransportStatus, e?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }
}
