/**
 * PUBLIC REALTIME API. OWNER: Developer 2.
 * Other modules import only from "@/lib/realtime".
 */
export type { RoomTransport, TransportStatus, Unsubscribe } from "./transport";
export { MockRoomTransport } from "./mock-transport";
export { SupabaseRoomTransport } from "./supabase-transport";
export { createTransport } from "./create-transport";
export { isSupabaseConfigured, resolveTransportKind, type TransportKind } from "./env";
export { channelName, generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./room-code";
export { createMessage, isNetworkMessage, newId, RecentIds, SeqTracker, ViewOrderTracker, type MessageBody } from "./protocol";
export { loadIdentity, loadTabIdentity, saveIdentity, type StoredIdentity } from "./player-identity";
