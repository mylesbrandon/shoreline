/**
 * Stable per-TAB player identity, per room. OWNER: Developer 2.
 *
 * Reconnect strategy: the same phone reopening /room/CODE gets the same playerId back, so the
 * host can give it its old role. But localStorage is shared by every tab in a browser, so if it were
 * the only source, several test tabs would all join as the SAME player (and all be captain).
 *
 *   1. sessionStorage (per tab, survives reload)            → reuse: this tab reloaded.
 *   2. localStorage "last id", if no other open tab holds it → reuse: tab was closed and reopened.
 *   3. otherwise                                            → new id: this is another tab/player.
 *
 * "Holds it" = a lease timestamp in localStorage that the owning tab refreshes every few seconds.
 * Call ONLY from event handlers or effects (not during render).
 */
import { newId } from "./protocol";

const lastKey = (roomCode: string) => `stormline:${roomCode}:player`;
const tabKey = (roomCode: string) => `stormline:${roomCode}:player-tab`;
const leaseKey = (roomCode: string, playerId: string) => `stormline:${roomCode}:lease:${playerId}`;

const LEASE_REFRESH_MS = 2_000;
const LEASE_TTL_MS = 6_000;

export interface StoredIdentity {
  playerId: string;
  name: string;
}

function parse(raw: string | null): StoredIdentity | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<StoredIdentity>;
    return typeof p.playerId === "string" && typeof p.name === "string" ? { playerId: p.playerId, name: p.name } : null;
  } catch {
    return null;
  }
}

function read(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(storage: "local" | "session", key: string, value: string | null): void {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Private mode / storage blocked: identity still works for this page load.
  }
}

function leaseHeldByAnotherTab(roomCode: string, playerId: string): boolean {
  const at = Number(read("local", leaseKey(roomCode, playerId)));
  return Number.isFinite(at) && Date.now() - at < LEASE_TTL_MS;
}

const leases = new Map<string, ReturnType<typeof setInterval>>();

function holdLease(roomCode: string, playerId: string): void {
  const key = leaseKey(roomCode, playerId);
  if (leases.has(key)) return;
  const refresh = () => write("local", key, String(Date.now()));
  refresh();
  leases.set(key, setInterval(refresh, LEASE_REFRESH_MS));
  // Release on close so a reopened tab can reclaim the id immediately (TTL covers crashes).
  window.addEventListener("pagehide", () => write("local", key, null));
}

/** The identity this tab would use, without claiming anything. */
export function loadIdentity(roomCode: string): StoredIdentity | null {
  return parse(read("session", tabKey(roomCode))) ?? parse(read("local", lastKey(roomCode)));
}

export function saveIdentity(roomCode: string, name: string): StoredIdentity {
  const mine = parse(read("session", tabKey(roomCode)));
  const last = parse(read("local", lastKey(roomCode)));
  const playerId =
    mine?.playerId ??
    (last && !leaseHeldByAnotherTab(roomCode, last.playerId) ? last.playerId : `p-${newId()}`);
  const identity = { playerId, name };
  const json = JSON.stringify(identity);
  write("session", tabKey(roomCode), json);
  write("local", lastKey(roomCode), json);
  holdLease(roomCode, playerId);
  return identity;
}
