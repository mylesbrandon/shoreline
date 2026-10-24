/**
 * MOCK TRANSPORT — same browser tab only. OWNER: Developer 2.
 *
 * Connects RoomTransport instances that live in the SAME JavaScript context (e.g. a host
 * session and some bot players on the host page, or two transports in a unit test).
 * It does NOT connect separate tabs or devices, and the UI must say so ("MOCK MODE").
 */
import type { NetworkMessage, PresenceMeta } from "@/game/types";
import type { RoomTransport, TransportStatus, Unsubscribe } from "./transport";

class MockBus {
  readonly members = new Set<MockRoomTransport>();

  presence(): PresenceMeta[] {
    return [...this.members].flatMap((t) => (t.me ? [t.me] : []));
  }

  broadcastPresence(): void {
    const list = this.presence();
    for (const m of this.members) m.emitPresence(list);
  }
}

const buses = new Map<string, MockBus>();

function busFor(roomCode: string): MockBus {
  let bus = buses.get(roomCode);
  if (!bus) {
    bus = new MockBus();
    buses.set(roomCode, bus);
  }
  return bus;
}

export interface MockTransportOptions {
  /** Simulated one-way latency in ms (default 0 — still async via setTimeout). */
  latencyMs?: number;
}

export class MockRoomTransport implements RoomTransport {
  readonly kind = "mock" as const;
  me: PresenceMeta | null = null;
  private messageHandlers = new Set<(m: NetworkMessage) => void>();
  private presenceHandlers = new Set<(members: PresenceMeta[]) => void>();
  private statusHandlers = new Set<(s: TransportStatus, e?: string) => void>();

  constructor(
    readonly roomCode: string,
    private readonly options: MockTransportOptions = {},
  ) {}

  async connect(me: PresenceMeta): Promise<void> {
    this.me = me;
    this.emitStatus("connecting");
    const bus = busFor(this.roomCode);
    bus.members.add(this);
    this.emitStatus("connected");
    bus.broadcastPresence();
  }

  async disconnect(): Promise<void> {
    const bus = busFor(this.roomCode);
    if (!bus.members.delete(this)) return;
    this.me = null;
    this.emitStatus("disconnected");
    bus.broadcastPresence();
  }

  send(message: NetworkMessage): void {
    const bus = busFor(this.roomCode);
    if (!bus.members.has(this)) return;
    // Structured clone mimics serialization over the wire (no shared references).
    const copy = structuredClone(message);
    for (const member of bus.members) {
      if (member === this) continue;
      setTimeout(() => member.emitMessage(copy), this.options.latencyMs ?? 0);
    }
  }

  onMessage(handler: (m: NetworkMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPresence(handler: (members: PresenceMeta[]) => void): Unsubscribe {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  onStatus(handler: (s: TransportStatus, e?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** @internal */
  emitMessage(m: NetworkMessage): void {
    for (const h of this.messageHandlers) h(m);
  }
  /** @internal */
  emitPresence(list: PresenceMeta[]): void {
    for (const h of this.presenceHandlers) h(list);
  }
  private emitStatus(s: TransportStatus, e?: string): void {
    for (const h of this.statusHandlers) h(s, e);
  }
}
