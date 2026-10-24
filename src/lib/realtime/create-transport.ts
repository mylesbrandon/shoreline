/**
 * Transport factory. OWNER: Developer 2.
 */
import { MockRoomTransport } from "./mock-transport";
import { SupabaseRoomTransport } from "./supabase-transport";
import { resolveTransportKind, type TransportKind } from "./env";
import type { RoomTransport } from "./transport";

export function createTransport(roomCode: string, kind: TransportKind = resolveTransportKind()): RoomTransport {
  // Each Supabase transport creates its own client (see supabase-client.ts for why).
  return kind === "supabase" ? new SupabaseRoomTransport(roomCode) : new MockRoomTransport(roomCode);
}
