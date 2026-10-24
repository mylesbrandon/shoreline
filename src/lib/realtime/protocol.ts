/**
 * Message construction, validation, dedupe and ordering. OWNER: Developer 2.
 * Pure (no network, no React) — unit tested in protocol.test.ts.
 */
import { PROTOCOL_VERSION } from "@/game/types";
import type { NetworkMessage, PlayerId } from "@/game/types";

/** Distributes Omit over the union so each variant keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MessageBody = DistributiveOmit<NetworkMessage, "v" | "msgId" | "from" | "sentAt">;

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMessage(from: PlayerId, body: MessageBody, now: number = Date.now()): NetworkMessage {
  return { ...body, v: PROTOCOL_VERSION, msgId: newId(), from, sentAt: now } as NetworkMessage;
}

const KNOWN_TYPES = new Set<NetworkMessage["type"]>([
  "action",
  "hello",
  "room",
  "views",
  "events",
  "action_rejected",
  "test",
]);

/** Cheap structural guard for anything arriving off the wire. Never trust payloads blindly. */
export function isNetworkMessage(value: unknown): value is NetworkMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    m.v === PROTOCOL_VERSION &&
    typeof m.msgId === "string" &&
    typeof m.from === "string" &&
    typeof m.sentAt === "number" &&
    typeof m.type === "string" &&
    KNOWN_TYPES.has(m.type as NetworkMessage["type"])
  );
}

/**
 * Host side: per-player action sequence tracking.
 * Accepts an action only if its seq is greater than the last accepted seq for that player.
 * A player who reloads starts again at seq 1 — call `resetPlayer` when they send `hello`.
 */
export class SeqTracker {
  private lastSeq = new Map<PlayerId, number>();

  accept(playerId: PlayerId, seq: number): boolean {
    const last = this.lastSeq.get(playerId) ?? 0;
    if (!Number.isInteger(seq) || seq <= last) return false;
    this.lastSeq.set(playerId, seq);
    return true;
  }

  resetPlayer(playerId: PlayerId): void {
    this.lastSeq.delete(playerId);
  }
}

/**
 * Client side: keep only views that are newer than what we've rendered.
 * A new gameId (START/RESET) always wins, so a restarted game's tick 0 isn't dropped.
 */
export class ViewOrderTracker {
  private gameId: string | null = null;
  private tick = -1;

  accept(gameId: string, tick: number): boolean {
    if (gameId !== this.gameId) {
      this.gameId = gameId;
      this.tick = tick;
      return true;
    }
    if (tick <= this.tick) return false;
    this.tick = tick;
    return true;
  }
}

/** Bounded set of recently seen msgIds (drops exact duplicate deliveries). */
export class RecentIds {
  private ids: string[] = [];
  private set = new Set<string>();
  constructor(private readonly capacity = 256) {}

  /** Returns true if the id is new (and records it). */
  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.ids.push(id);
    if (this.ids.length > this.capacity) {
      const old = this.ids.shift();
      if (old !== undefined) this.set.delete(old);
    }
    return true;
  }
}
