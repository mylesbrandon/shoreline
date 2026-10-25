"use client";
/**
 * Versus host / spectator laptop screen. OWNER: Developer 2 (route composition).
 * Runs the authoritative VersusHostSession and shows the lineup, QR and both oceans.
 * Mirrors HostScreen; the co-op screen is untouched.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { versusEngine } from "@/game/engine";
import { SLOT_ORDER } from "@/game/versus/contract";
import type { PlayerTeamAssignment } from "@/game/versus/contract";
import { VersusHostSession } from "@/lib/game-client/versus-host-session";
import { useStore } from "@/lib/game-client/hooks";
import { createTransport } from "@/lib/realtime/create-transport";
import { JoinQr } from "@/components/shared/JoinQr";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { Wordmark } from "@/components/shared/Wordmark";
import { TEAM_INFO, VERSUS_ROLE_INFO } from "@/components/shared/teams";
import { VersusSpectatorDisplay } from "@/components/ocean/versus/VersusSpectatorDisplay";
import { VersusResults } from "@/components/ocean/versus/VersusResults";

const seatKey = (s: PlayerTeamAssignment) => `${s.team}:${s.role}`;

export function VersusHostScreen({ roomCode, lanOrigin = null }: { roomCode: string; lanOrigin?: string | null }) {
  // Constructing a session has no side effects; start()/stop() happen in the effect below.
  const [session] = useState(
    () => new VersusHostSession({ roomCode, transport: createTransport(roomCode), engine: versusEngine }),
  );
  const snap = useStore(session.store);
  const isMock = session.transportKind === "mock";

  useEffect(() => {
    session.start().catch(() => {
      /* status + error are already in the store via onStatus */
    });
    return () => {
      void session.stop();
    };
  }, [session]);

  const playing = snap.room.status === "playing";
  const result = snap.spectator.scoreboard.result;
  const seated = snap.room.players.filter((p) => p.slot !== null && p.connected).length;

  return (
    <main className="mx-auto grid min-h-dvh max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px] lg:px-8">
      <section className="grid content-start gap-3">
        {!isMock && <ConnectionBanner status={snap.status} error={snap.error} />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-2xl font-bold">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Rescue Showdown · 2v2</span>
            <ModeBadge mode={isMock ? "mock" : "live"} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[min(100%,80dvh)]">
          <VersusSpectatorDisplay view={snap.spectator} />
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <div className="instrument grid gap-3 rounded-2xl p-5 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Room code</p>
          <p className="font-mono text-5xl font-semibold tracking-[0.3em] text-teal">{roomCode}</p>
          <JoinQr roomCode={roomCode} lanOrigin={lanOrigin} path="versus/room" />
        </div>

        {isMock && (
          <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
            Mock mode: phones cannot join this room. Add Supabase keys to <code>.env.local</code> for real multiplayer
            (docs/DEPLOY.md), or open the <Link className="underline" href="/versus/preview">versus preview</Link>.
          </p>
        )}
        {isMock && snap.error && (
          <p className="rounded-xl border border-hazard/50 bg-hazard/10 p-3 text-sm text-hazard">{snap.error}</p>
        )}
        {result && (
          <VersusResults result={result} footer={<p className="text-sm text-mist">Press Reset, then Start to play again.</p>} />
        )}

        <div className="instrument grid gap-2 rounded-2xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">
            Lineup · {seated}/4 · {snap.status}
          </p>
          {SLOT_ORDER.map((slot) => {
            const team = TEAM_INFO[slot.team];
            const role = VERSUS_ROLE_INFO[slot.role];
            const Icon = role.icon;
            const player = snap.room.players.find((p) => p.slot !== null && seatKey(p.slot) === seatKey(slot));
            return (
              <div key={seatKey(slot)} className={`flex items-center gap-2 rounded-lg border-l-4 bg-navy px-3 py-2 ${team.border}`}>
                <Icon className={`size-5 ${team.text}`} />
                <span className="w-28 shrink-0 text-xs text-mist">
                  <span className={team.text}>{team.label}</span>
                  <br />
                  {role.label}
                </span>
                <select
                  // Reseating is host-only: the phone never picks its own seat.
                  value={player?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === "") {
                      if (player) session.assignSlot(player.id, null);
                    } else {
                      session.assignSlot(id, slot);
                    }
                  }}
                  aria-label={`${team.label} ${role.label}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-hull bg-abyss px-2 text-sm text-foam"
                >
                  <option value="">— empty —</option>
                  {snap.room.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.connected ? "" : " (offline)"}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {snap.room.players.some((p) => p.slot === null) && (
            <p className="font-mono text-xs text-hull">
              Watching: {snap.room.players.filter((p) => p.slot === null).map((p) => p.name).join(", ")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => session.startMatch()}
            disabled={playing}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-semibold uppercase tracking-widest text-abyss disabled:opacity-40"
          >
            <Play className="size-4" /> Start
          </button>
          <button
            type="button"
            onClick={() => session.resetMatch()}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-hull font-semibold uppercase tracking-widest text-mist"
          >
            <RotateCcw className="size-4" /> Reset
          </button>
        </div>
      </aside>
    </main>
  );
}
