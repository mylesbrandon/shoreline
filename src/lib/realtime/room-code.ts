/**
 * Room codes. OWNER: Developer 2.
 * 4 uppercase letters, no easily-confused letters (I, O), so they're easy to read aloud.
 */
import { ROOM } from "@/game/config";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** `random` is injectable for tests; defaults to Math.random (fine here — not game logic). */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM.codeLength; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM.codeLength);
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM.codeLength && /^[A-Z]+$/.test(code);
}

export function channelName(code: string): string {
  return `${ROOM.channelPrefix}${code}`;
}
