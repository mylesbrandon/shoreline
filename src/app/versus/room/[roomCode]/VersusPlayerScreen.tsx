"use client";
/**
 * Versus phone screen: name entry → seat card → station → results. OWNER: Developer 2.
 * Same identity flow as the co-op PlayerScreen (nothing read from storage during render);
 * the co-op screen itself is untouched.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlayerTeamAssignment } from "@/game/versus/contract";
import { VersusPlayerSession } from "@/lib/game-client/versus-player-session";
import { useStore } from "@/lib/game-client/hooks";
import { createTransport } from "@/lib/realtime/create-transport";
import { resolveTransportKind } from "@/lib/realtime/env";
import { loadTabIdentity, saveIdentity, type StoredIdentity } from "@/lib/realtime/player-identity";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { Wordmark } from "@/components/shared/Wordmark";
import { VersusRoleStation } from "@/components/shared/VersusRoleStation";
import { TEAM_INFO, VERSUS_ROLE_INFO } from "@/components/shared/teams";
import { MatchScoreStrip } from "@/components/ocean/versus/MatchScoreStrip";
import { VersusResults } from "@/components/ocean/versus/VersusResults";

/** See PlayerScreen: storage can only be read after mount, so "checking" covers that one frame. */
type Boarding =
  | { phase: "checking" }
  | { phase: "form"; name: string }
  | { phase: "joined"; session: VersusPlayerSession };

export function VersusPlayerScreen({ roomCode, initialName }: { roomCode: string; initialName: string }) {
  const isMock = resolveTransportKind() === "mock";
  const [boarding, setBoarding] = useState<Boarding>(
    isMock ? { phase: "form", name: initialName } : { phase: "checking" },
  );
  const restored = useRef(false);

  const join = (identity: StoredIdentity) =>
    setBoarding({
      phase: "joined",
      session: new VersusPlayerSession({ transport: createTransport(roomCode), identity }),
    });

  // A reloaded phone must come back to the SAME seat: the host keys seats by playerId and only
  // flips `connected`, so reconnecting with this tab's id is enough (hello → versus_room + views).
  useEffect(() => {
    if (isMock || restored.current) return;
    restored.current = true;
    const mine = loadTabIdentity(roomCode);
    setBoarding(
      mine
        ? {
            phase: "joined",
            session: new VersusPlayerSession({
              transport: createTransport(roomCode),
              identity: saveIdentity(roomCode, mine.name),
            }),
          }
        : { phase: "form", name: initialName },
    );
  }, [isMock, roomCode, initialName]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-start gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          <Wordmark />
        </Link>
        <span className="font-mono text-sm tracking-[0.3em] text-mist">{roomCode}</span>
      </header>

      {isMock ? (
        <MockNotice />
      ) : boarding.phase === "joined" ? (
        <SeatedView session={boarding.session} />
      ) : boarding.phase === "checking" ? (
        <p className="instrument rounded-2xl p-5 text-mist">Reconnecting…</p>
      ) : (
        <form
          className="instrument grid gap-3 rounded-2xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            join(saveIdentity(roomCode, boarding.name.trim() || "Lifeguard"));
          }}
        >
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Your name</span>
            <input
              value={boarding.name}
              onChange={(e) => setBoarding({ phase: "form", name: e.target.value.slice(0, 16) })}
              autoFocus
              className="h-14 rounded-xl border border-hull bg-navy px-4 text-xl text-foam focus:border-teal focus:outline-none"
            />
          </label>
          <button type="submit" className="h-14 rounded-xl bg-teal font-semibold uppercase tracking-[0.2em] text-abyss">
            Join the showdown
          </button>
        </form>
      )}
    </main>
  );
}

function MockNotice() {
  return (
    <div className="grid gap-3">
      <ModeBadge mode="mock" />
      <p className="instrument rounded-2xl p-5 text-mist">
        Supabase isn&apos;t configured, so this phone can&apos;t reach a host. Mock mode never pretends devices are
        synchronized. Configure <code>.env.local</code> (see docs/DEPLOY.md), or open the{" "}
        <Link className="underline" href="/versus/preview">
          versus preview
        </Link>
        .
      </p>
    </div>
  );
}

/** Seat card shown in lobby/briefing, before the whistle. */
function SeatCard({ slot }: { slot: PlayerTeamAssignment }) {
  const team = TEAM_INFO[slot.team];
  const role = VERSUS_ROLE_INFO[slot.role];
  const Icon = role.icon;
  return (
    <div className={`instrument grid justify-items-center gap-3 rounded-2xl border-t-4 p-8 text-center ${team.border}`}>
      <p className={`font-mono text-xs uppercase tracking-[0.3em] ${team.text}`}>{team.label}</p>
      <Icon className={`size-14 ${team.text}`} />
      <h1 className={`text-4xl font-bold ${team.text}`}>{role.label}</h1>
      <p className="text-mist">{role.brief}</p>
      <p className="font-mono text-xs text-hull">Waiting for the whistle…</p>
    </div>
  );
}

function SeatedView({ session }: { session: VersusPlayerSession }) {
  const snap = useStore(session.store);

  useEffect(() => {
    session.start().catch(() => {
      /* error is in the store via onStatus */
    });
    return () => {
      void session.stop();
    };
  }, [session]);

  const banner = <ConnectionBanner status={snap.status} error={snap.error} />;
  const slot = snap.me?.slot ?? null;

  // Not seated: either the host hasn't listed us yet, or all four seats are taken.
  if (!slot) {
    return (
      <div className="grid gap-3">
        {banner}
        <div className="instrument grid gap-2 rounded-2xl p-5">
          <ModeBadge mode="live" />
          <p className="text-lg">
            {snap.room && snap.me
              ? "All four seats are taken — you're watching this round."
              : `Contacting host… (${snap.status})`}
          </p>
        </div>
      </div>
    );
  }

  const { scoreboard, view } = snap;

  if (scoreboard?.phase === "ended" && scoreboard.result) {
    return (
      <div className="grid gap-3">
        {banner}
        <VersusResults
          result={scoreboard.result}
          team={slot.team}
          footer={<p className="font-mono text-xs text-mist">Stay on this screen — the host can start the next match.</p>}
        />
      </div>
    );
  }

  // Briefing/lobby, or the first bundle hasn't landed yet.
  if (!view || !scoreboard || scoreboard.phase === "briefing") {
    return (
      <div className="grid gap-3">
        {banner}
        <SeatCard slot={slot} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {banner}
      <MatchScoreStrip scoreboard={scoreboard} team={slot.team} />
      <VersusRoleStation view={view} onAction={(a) => session.sendAction(a)} />
    </div>
  );
}
