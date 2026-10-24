"use client";
/**
 * Host / spectator laptop screen. OWNER: Developer 2 (route composition).
 * Runs the authoritative HostSession (engine + transport) and shows lobby, QR, and the ocean.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { engine } from "@/game/engine";
import { ROLES } from "@/game/types";
import { mockSpectatorViewAt } from "@/game/mock-state";
import { HostSession } from "@/lib/game-client/host-session";
import { useStore } from "@/lib/game-client/hooks";
import { createTransport } from "@/lib/realtime/create-transport";
import { JoinQr } from "@/components/shared/JoinQr";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { isMissionOver, MissionResults } from "@/components/shared/MissionResults";
import { ROLE_INFO } from "@/components/shared/roles";
import { useAnimationTime } from "@/components/shared/use-animation-time";
import { SpectatorDisplay } from "@/components/ocean/SpectatorDisplay";

export function HostScreen({ roomCode, lanOrigin = null }: { roomCode: string; lanOrigin?: string | null }) {
  // Constructing a session has no side effects; start()/stop() happen in the effect below.
  const [session] = useState(() => new HostSession({ roomCode, transport: createTransport(roomCode), engine }));
  const snap = useStore(session.store);
  const isMock = session.transportKind === "mock";
  const [scripted, setScripted] = useState(isMock);
  const t = useAnimationTime(scripted);

  useEffect(() => {
    session.start().catch(() => {
      /* status + error are already in the store via onStatus */
    });
    return () => {
      void session.stop();
    };
  }, [session]);

  const spectator = scripted ? mockSpectatorViewAt(t) : snap.spectator;
  const playing = snap.room.status === "playing";

  return (
    <main className="mx-auto grid min-h-dvh max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px] lg:px-8">
      <section className="grid content-start gap-3">
        {!isMock && <ConnectionBanner status={snap.status} error={snap.error} />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-2xl font-bold">
            Storm<span className="text-teal">line</span>
          </Link>
          <div className="flex items-center gap-2">
            {scripted && <ModeBadge mode="preview" />}
            <ModeBadge mode={isMock ? "mock" : "live"} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[min(100%,80dvh)]">
          <SpectatorDisplay view={spectator} />
        </div>
        {isMock && (
          <label className="flex items-center gap-2 font-mono text-xs text-mist">
            <input type="checkbox" checked={scripted} onChange={(e) => setScripted(e.target.checked)} />
            Show scripted mock motion (unchecked = local engine output)
          </label>
        )}
      </section>

      <aside className="grid content-start gap-4">
        <div className="instrument grid gap-3 rounded-2xl p-5 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Room code</p>
          <p className="font-mono text-5xl font-semibold tracking-[0.3em] text-teal">{roomCode}</p>
          <JoinQr roomCode={roomCode} lanOrigin={lanOrigin} />
        </div>

        {isMock && (
          <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
            Mock mode: phones cannot join this room. Add Supabase keys to <code>.env.local</code> for real multiplayer
            (docs/DEPLOY.md), or open a <Link className="underline" href="/room/DEMO?preview=captain">station preview</Link>.
          </p>
        )}
        {isMock && snap.error && (
          <p className="rounded-xl border border-hazard/50 bg-hazard/10 p-3 text-sm text-hazard">{snap.error}</p>
        )}
        {!scripted && isMissionOver(snap.spectator.mission) && (
          <MissionResults mission={snap.spectator.mission} footer={<p className="text-sm text-mist">Press Reset, then Start to play again.</p>} />
        )}

        <div className="instrument grid gap-2 rounded-2xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">
            Crew · {snap.room.players.filter((p) => p.connected).length}/4 · {snap.status}
          </p>
          {ROLES.map((role) => {
            const player = snap.room.players.find((p) => p.role === role);
            const info = ROLE_INFO[role];
            const Icon = info.icon;
            return (
              <div key={role} className="flex items-center gap-3 rounded-lg bg-navy px-3 py-2">
                <Icon className={`size-5 ${info.accent}`} />
                <span className="w-20 text-sm text-mist">{info.label}</span>
                <span className={`flex-1 truncate ${player?.connected ? "text-foam" : "text-hull"}`}>
                  {player ? player.name : "waiting…"}
                  {player && !player.connected && " (offline)"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setScripted(false);
              session.startMission();
            }}
            disabled={playing}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-semibold uppercase tracking-widest text-abyss disabled:opacity-40"
          >
            <Play className="size-4" /> Start
          </button>
          <button
            type="button"
            onClick={() => session.resetMission()}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-hull font-semibold uppercase tracking-widest text-mist"
          >
            <RotateCcw className="size-4" /> Reset
          </button>
        </div>
      </aside>
    </main>
  );
}
