/**
 * Environment detection. OWNER: Developer 2.
 * NEXT_PUBLIC_* values are inlined at build time, so these must be referenced literally.
 */
export type TransportKind = "mock" | "supabase";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FORCED = process.env.NEXT_PUBLIC_SHORELINE_TRANSPORT ?? "";

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export function resolveTransportKind(): TransportKind {
  if (FORCED === "mock") return "mock";
  if (FORCED === "supabase") return "supabase";
  return isSupabaseConfigured ? "supabase" : "mock";
}
