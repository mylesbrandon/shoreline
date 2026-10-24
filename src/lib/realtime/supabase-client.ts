/**
 * Lazily-created browser Supabase client. OWNER: Developer 2.
 * Only Realtime is used (no auth, no tables).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NETWORK } from "@/game/config";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in (see docs/DEPLOY.md).");
  }
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: NETWORK.eventsPerSecond } },
  });
  return client;
}
