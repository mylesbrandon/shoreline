/**
 * The transport contract. OWNER: Developer 2.
 *
 * Everything above this layer (host session, player session, React) talks to a RoomTransport
 * and never imports Supabase directly. Two implementations:
 *   - MockRoomTransport      (mock-transport.ts)   same-tab, in-memory. For UI work and tests.
 *   - SupabaseRoomTransport  (supabase-transport.ts) Realtime Broadcast + Presence.
 */
import type { NetworkMessage, PresenceMeta } from "@/game/types";

export type TransportStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type Unsubscribe = () => void;

export interface RoomTransport {
  readonly kind: "mock" | "supabase";
  readonly roomCode: string;

  /** Join the room channel and start tracking presence with `me`. Resolves once subscribed. */
  connect(me: PresenceMeta): Promise<void>;
  /** Leave the channel (untracks presence). Safe to call twice. */
  disconnect(): Promise<void>;

  /** Broadcast to every OTHER member of the room (the sender does not receive its own message). */
  send(message: NetworkMessage): void;

  onMessage(handler: (message: NetworkMessage) => void): Unsubscribe;
  /** Called with the full current member list whenever presence changes. */
  onPresence(handler: (members: PresenceMeta[]) => void): Unsubscribe;
  onStatus(handler: (status: TransportStatus, error?: string) => void): Unsubscribe;
}
