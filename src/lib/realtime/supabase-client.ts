/**
 * Browser Supabase clients. OWNER: Developer 2.
 * Only Realtime is used (no auth, no tables).
 *
 * Why a factory and not a singleton: supabase-js (realtime-js ≥ 2.11) returns the SAME channel
 * object when `channel()` is called twice with the same topic on one client. Two transports for the
 * same room in one tab (React StrictMode's double-mount in dev, or a debug page next to a session)
 * would then share and tear down each other's channel. One client per transport keeps them isolated;
 * a page normally has exactly one transport, so this is one WebSocket per page.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NETWORK } from "@/game/config";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

let clientCount = 0;

export function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in (see docs/DEPLOY.md).");
  }
  clientCount += 1;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Unique storageKey avoids the "Multiple GoTrueClient instances" warning; auth is unused anyway.
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `stormline-rt-${clientCount}` },
    realtime: { params: { eventsPerSecond: NETWORK.eventsPerSecond } },
  });
}

let shared: SupabaseClient | null = null;

/** Shared lazily-created client, for anything that isn't a room transport. */
export function getSupabaseClient(): SupabaseClient {
  shared ??= createSupabaseClient();
  return shared;
}
