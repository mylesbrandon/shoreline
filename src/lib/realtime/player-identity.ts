/**
 * Stable per-device player identity, per room. OWNER: Developer 2.
 *
 * Reconnect strategy: the same phone reopening /room/CODE gets the same playerId back, so the
 * host can give it its old role. Call ONLY from event handlers or effects (not during render).
 */
import { newId } from "./protocol";

const key = (roomCode: string) => `stormline:${roomCode}:player`;

export interface StoredIdentity {
  playerId: string;
  name: string;
}

export function loadIdentity(roomCode: string): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(key(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    return typeof parsed.playerId === "string" && typeof parsed.name === "string"
      ? { playerId: parsed.playerId, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

export function saveIdentity(roomCode: string, name: string): StoredIdentity {
  const existing = loadIdentity(roomCode);
  const identity = { playerId: existing?.playerId ?? `p-${newId()}`, name };
  try {
    window.localStorage.setItem(key(roomCode), JSON.stringify(identity));
  } catch {
    // Private mode / storage blocked: identity still works for this page load.
  }
  return identity;
}
