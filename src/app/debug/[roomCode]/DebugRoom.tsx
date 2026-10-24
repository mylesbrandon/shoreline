"use client";
/**
 * TEMPORARY transport debug screen. OWNER: Developer 2.
 *
 * Uses a RoomTransport directly (no HostSession/PlayerSession) so it tests exactly one thing:
 * do two browsers on the same channel see each other's presence and broadcasts?
 *
 * The id lives in sessionStorage (per TAB, survives reload) so two tabs of the same browser show
 * up as two members, and reloading a tab rejoins as the same member.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NetworkMessage, PresenceMeta } from "@/game/types";
import { createTransport } from "@/lib/realtime/create-transport";
import { resolveTransportKind } from "@/lib/realtime/env";
import { createMessage, newId } from "@/lib/realtime/protocol";
import type { RoomTransport, TransportStatus } from "@/lib/realtime/transport";
import { ModeBadge } from "@/components/shared/ModeBadge";

interface LogEntry {
  key: string;
  at: number;
  text: string;
  tone: "in" | "out" | "status";
}

function tabId(roomCode: string): string {
  const key = `stormline:${roomCode}:debug-id`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = `dbg-${newId().slice(0, 8)}`;
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `dbg-${newId().slice(0, 8)}`;
  }
}

const STATUS_STYLE: Record<TransportStatus, string> = {
  idle: "text-mist",
  connecting: "text-amber",
  connected: "text-teal",
  disconnected: "text-mist",
  error: "text-hazard",
};

export function DebugRoom({ roomCode, name }: { roomCode: string; name: string }) {
  const isMock = resolveTransportKind() === "mock";
  const [online, setOnline] = useState(true);
  const [me, setMe] = useState<PresenceMeta | null>(null);
  const [status, setStatus] = useState<TransportStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<PresenceMeta[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const transportRef = useRef<RoomTransport | null>(null);
  const meRef = useRef<PresenceMeta | null>(null);
  const counter = useRef(0);

  const addLog = (text: string, tone: LogEntry["tone"]) =>
    setLog((l) => [{ key: newId(), at: Date.now(), text, tone }, ...l].slice(0, 50));

  useEffect(() => {
    if (!online) return;
    const id = tabId(roomCode);
    const meta: PresenceMeta = { playerId: id, name: name || `Tab ${id.slice(-4)}`, kind: "player", onlineAt: Date.now() };
    const transport = createTransport(roomCode);
    transportRef.current = transport;
    meRef.current = meta;

    const unsubs = [
      transport.onStatus((s, e) => {
        setStatus(s);
        setError(e ?? null);
        addLog(`status → ${s}${e ? ` (${e})` : ""}`, "status");
      }),
      transport.onPresence((list) => setMembers(list)),
      transport.onMessage((m: NetworkMessage) => {
        const latency = Date.now() - m.sentAt; // cross-device clocks may differ slightly
        const body = m.type === "test" ? `"${m.text}"` : m.type;
        addLog(`← ${body} from ${m.from} · ≈${latency} ms`, "in");
      }),
    ];

    transport
      .connect(meta)
      .then(() => setMe(meta))
      .catch((e: unknown) => addLog(`connect failed: ${e instanceof Error ? e.message : String(e)}`, "status"));

    return () => {
      unsubs.forEach((u) => u());
      transportRef.current = null;
      void transport.disconnect();
      setMembers([]);
      setMe(null);
      setStatus("disconnected");
    };
  }, [roomCode, name, online]);

  const sendTest = () => {
    const t = transportRef.current;
    const self = meRef.current;
    if (!t || !self) return;
    counter.current += 1;
    const text = `test #${counter.current} from ${self.name}`;
    t.send(createMessage(self.playerId, { type: "test", text }));
    addLog(`→ "${text}"`, "out");
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-start gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-xl font-bold">
          Storm<span className="text-teal">line</span> <span className="font-mono text-sm text-mist">debug</span>
        </Link>
        <ModeBadge mode={isMock ? "mock" : "live"} />
      </header>

      <section className="instrument grid gap-3 rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Room</span>
          <span className="font-mono text-2xl tracking-[0.3em]">{roomCode}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Status</span>
          <span className={`font-mono ${STATUS_STYLE[status]}`}>{status}</span>
        </div>
        {error && <p className="rounded-lg border border-hazard/50 bg-hazard/10 p-3 text-sm text-hazard">{error}</p>}
        {isMock && (
          <p className="rounded-lg border border-amber/50 bg-amber/10 p-3 text-sm text-amber">
            No Supabase env vars, so this is mock mode: only this tab is in the room and other tabs won&apos;t appear.
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={sendTest}
            disabled={status !== "connected"}
            className="h-14 rounded-xl bg-teal font-semibold uppercase tracking-[0.15em] text-abyss disabled:opacity-40"
          >
            Send test
          </button>
          <button
            type="button"
            onClick={() => setOnline((o) => !o)}
            className="h-14 rounded-xl border border-hull font-semibold uppercase tracking-[0.15em] text-foam"
          >
            {online ? "Leave" : "Rejoin"}
          </button>
        </div>
      </section>

      <section className="instrument grid gap-2 rounded-2xl p-5">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Presence ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-sm text-mist">Nobody here yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {members.map((m) => (
              <li key={m.playerId} className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
                <span>
                  <span className="mr-2 inline-block size-2 rounded-full bg-teal" />
                  {m.name}
                  {m.playerId === me?.playerId && <span className="ml-2 text-xs text-teal">(you)</span>}
                </span>
                <span className="font-mono text-xs text-mist">
                  {m.kind} · {m.playerId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="instrument grid gap-2 rounded-2xl p-5">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-mist">Messages you send and receive show up here.</p>
        ) : (
          <ul className="grid gap-1 font-mono text-xs">
            {log.map((e) => (
              <li key={e.key} className={e.tone === "in" ? "text-teal" : e.tone === "out" ? "text-foam" : "text-mist"}>
                <span className="text-mist">{new Date(e.at).toLocaleTimeString()} </span>
                {e.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
