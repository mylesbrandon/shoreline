/**
 * Transport factory. OWNER: Developer 2.
 */
import { MockRoomTransport } from "./mock-transport";
import { SupabaseRoomTransport } from "./supabase-transport";
import { getSupabaseClient } from "./supabase-client";
import { resolveTransportKind, type TransportKind } from "./env";
import type { RoomTransport } from "./transport";

export function createTransport(roomCode: string, kind: TransportKind = resolveTransportKind()): RoomTransport {
  return kind === "supabase"
    ? new SupabaseRoomTransport(roomCode, getSupabaseClient())
    : new MockRoomTransport(roomCode);
}
