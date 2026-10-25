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
import { SoundToggle } from "@/components/shared/audio/SoundToggle";
import { useHostMusic } from "@/lib/audio/use-host-music";
import { useHostAwake } from "./use-host-awake";

const seatKey = (s: PlayerTeamAssignment) => `${s.team}:${s.role}`;

export function VersusHostScreen({ roomCode, lanOrigin = null }: { roomCode: string; lanOrigin?: string | null }) {
  // Constructing a session has no side effects; start()/stop() happen in the effect below.
  const [session] = useState(
    () => new VersusHostSession({ roomCode, transport: createTransport(roomCode), engine: versusEngine }),
  );
  const snap = useStore(session.store);
  const isMock = session.transportKind === "mock";
  const music = useHostMusic(snap.spectator.scoreboard);

  useEffect(() => {
    session.start().catch(() => {
      /* status + error are already in the store via onStatus */
    });
    return () => {
      void session.stop();
    };
  }, [session]);

  const playing = snap.room.status === "playing";
  const matchRunning = snap.spectator.scoreboard.phase === "countdown" || snap.spectator.scoreboard.phase === "active";
  const awake = useHostAwake(matchRunning);
  const result = snap.spectator.scoreboard.result;
  const seated = snap.room.players.filter((p) => p.slot !== null && p.connected).length;

  const lineupFor = (team: PlayerTeamAssignment["team"]) => SLOT_ORDER.filter((slot) => slot.team === team);
  const watching = snap.room.players.filter((p) => p.slot === null);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <section className="grid content-start gap-3">
          {!isMock && <ConnectionBanner status={snap.status} error={snap.error} />}
          {awake.wasHidden && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber bg-amber/15 px-4 py-3 text-amber">
              <p className="font-semibold">
                The host tab was in the background, so the match slowed down for everyone. Keep this tab in front during a match.
              </p>
              <button type="button" onClick={awake.dismiss} className="h-10 shrink-0 rounded-xl border border-amber px-3 font-semibold">
                Got it
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-3xl focus-visible:outline-2 focus-visible:outline-amber">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-3">
              <SoundToggle kind="music" muted={music.muted} unlocked={music.unlocked} onToggle={music.toggleMute} />
              <span className="text-lg font-semibold text-mist">Rescue Showdown</span>
              <ModeBadge mode={isMock ? "mock" : "live"} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[min(100%,80dvh)]">
            <VersusSpectatorDisplay view={snap.spectator} />
          </div>
        </section>

        <aside className="grid content-start gap-4">
          {/* The lifeguard-tower board: the code people type, painted on sand. */}
          <div className="grid gap-3 rounded-3xl border-2 border-wet-sand bg-sand p-5 text-center text-[#12324a] shadow-[0_6px_0_#c99a52]">
            <p className="text-base font-semibold">Scan to join, or type the code</p>
            <p className="font-poster text-6xl tracking-[0.18em]">{roomCode}</p>
            <JoinQr roomCode={roomCode} lanOrigin={lanOrigin} path="versus/room" onLight />
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
            <VersusResults result={result} landing={false} footer={<p className="text-sm text-mist">Start a new match, then blow the whistle.</p>} />
          )}

          <p className="flex items-baseline justify-between px-1 text-mist">
            <span className="text-lg font-semibold text-foam">Crews</span>
            <span className="text-sm">
              {seated} of 4 on the beach · {snap.status}
            </span>
          </p>
          {(["blue", "red"] as const).map((teamId) => {
            const team = TEAM_INFO[teamId];
            return (
              <div key={teamId} className="towel grid gap-2 px-4 pb-4" style={{ ["--towel" as string]: team.hex }}>
                <p className={`font-poster text-xl ${team.text}`}>{team.label}</p>
                {lineupFor(teamId).map((slot) => {
                  const role = VERSUS_ROLE_INFO[slot.role];
                  const Icon = role.icon;
                  const player = snap.room.players.find((p) => p.slot !== null && seatKey(p.slot) === seatKey(slot));
                  return (
                    <label key={seatKey(slot)} className="flex items-center gap-3">
                      <Icon className={`size-5 shrink-0 ${team.text}`} aria-hidden />
                      <span className="w-20 shrink-0 text-sm font-semibold text-foam">{role.label}</span>
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
                        className="h-10 min-w-0 flex-1 rounded-xl border border-sand/40 bg-abyss/80 px-2 text-base text-foam focus:border-amber focus:outline-none"
                      >
                        <option value="">Open seat</option>
                        {snap.room.players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.connected ? "" : " (offline)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            );
          })}
          {watching.length > 0 && (
            <p className="px-1 text-sm text-mist">Watching from the sand: {watching.map((p) => p.name).join(", ")}</p>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => session.startMatch()}
              disabled={playing}
              className="btn-buoy flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-bold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam"
            >
              <Play className="size-5" /> Blow the whistle
            </button>
            <button
              type="button"
              onClick={() => session.resetMatch()}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-sand/50 px-4 font-semibold text-foam focus-visible:outline-2 focus-visible:outline-amber"
            >
              <RotateCcw className="size-4" /> New match
            </button>
          </div>
        </aside>
      </main>
      <footer className="shoreline" aria-hidden />
    </div>
  );
}
