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
import { TEAM_INFO, VERSUS_ROLE_INFO, VERSUS_ROLE_STEPS } from "@/components/shared/teams";
import { MatchScoreStrip } from "@/components/ocean/versus/MatchScoreStrip";
import { VersusResults } from "@/components/ocean/versus/VersusResults";
import { SoundToggle } from "@/components/shared/audio/SoundToggle";
import { disposeSharedPhoneSfx, unlockPhoneAudioFromGesture } from "@/lib/audio/sfx";
import { usePhoneSfx } from "@/lib/audio/use-phone-sfx";

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

  useEffect(() => () => disposeSharedPhoneSfx(), []);

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-start gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-2xl focus-visible:outline-2 focus-visible:outline-amber">
          <Wordmark />
        </Link>
        <span className="rounded-full bg-sand px-3 py-0.5 font-poster text-base tracking-[0.15em] text-[#12324a]" aria-label={`Room ${roomCode}`}>
          {roomCode}
        </span>
      </header>

      {isMock ? (
        <MockNotice />
      ) : boarding.phase === "joined" ? (
        <SeatedView session={boarding.session} />
      ) : boarding.phase === "checking" ? (
        <p className="instrument rounded-2xl p-5 text-mist">Reconnecting…</p>
      ) : (
        <form
          className="instrument grid gap-4 rounded-3xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            unlockPhoneAudioFromGesture();
            join(saveIdentity(roomCode, boarding.name.trim() || "Lifeguard"));
          }}
        >
          <label className="grid gap-2">
            <span className="text-lg font-semibold text-foam">What should your crew call you?</span>
            <input
              value={boarding.name}
              onChange={(e) => setBoarding({ phase: "form", name: e.target.value.slice(0, 16) })}
              autoFocus
              placeholder="Lifeguard"
              className="h-14 rounded-2xl border-2 border-sand/40 bg-abyss/70 px-4 text-xl text-foam placeholder:text-foam/30 focus:border-amber focus:outline-none"
            />
          </label>
          <button type="submit" className="btn-buoy h-14 rounded-2xl text-lg font-bold">
            Join the showdown
          </button>
          <p className="text-sm text-mist">The laptop puts you on a crew. You&apos;ll see your job here.</p>
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
        This build has no multiplayer connection, so this phone can&apos;t reach a host. Open the{" "}
        <Link className="underline" href="/versus/preview">
          practice screens
        </Link>{" "}
        instead.
      </p>
    </div>
  );
}

/**
 * Seat card shown in lobby/briefing, before the whistle. This is the only moment a new player has
 * to read anything, so it carries the whole how-to-play for their seat: who they are, who they're
 * with, and the numbered steps. Left-aligned list, no scroll at 375 px.
 */
function SeatCard({ slot, teammate }: { slot: PlayerTeamAssignment; teammate: string | null }) {
  const team = TEAM_INFO[slot.team];
  const role = VERSUS_ROLE_INFO[slot.role];
  const Icon = role.icon;
  const steps = VERSUS_ROLE_STEPS[slot.role];
  return (
    <div className="towel grid gap-4 px-5 pb-5" style={{ ["--towel" as string]: team.hex }}>
      <div className="grid justify-items-center gap-1 pt-2 text-center">
        <Icon className={`size-12 ${team.text}`} />
        <h1 className={`font-poster text-4xl leading-tight ${team.text}`}>{role.label}</h1>
        <p className="text-base font-semibold text-foam">
          {team.label}
          {teammate && (
            <>
              {" "}with <span className={team.text}>{teammate}</span>
            </>
          )}
        </p>
      </div>

      <ol className="grid gap-2.5">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-abyss ${team.bg}`}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug text-foam">{step}</span>
          </li>
        ))}
      </ol>

      <p className="text-center text-base font-semibold text-amber">
        Waiting for the whistle…
      </p>
    </div>
  );
}

function SeatedView({ session }: { session: VersusPlayerSession }) {
  const snap = useStore(session.store);
  const sfx = usePhoneSfx({
    recentEvents: snap.recentEvents,
    scoreboard: snap.scoreboard,
    slot: snap.me?.slot ?? null,
  });

  useEffect(() => {
    session.start().catch(() => {
      /* error is in the store via onStatus */
    });
    return () => {
      void session.stop();
    };
  }, [session]);

  const banner = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ConnectionBanner status={snap.status} error={snap.error} />
      <SoundToggle kind="sfx" muted={sfx.muted} unlocked={sfx.unlocked} onToggle={sfx.toggleMute} />
    </div>
  );
  const slot = snap.me?.slot ?? null;
  // The other seat on my team, so the wait screen can name who I'm shouting at.
  const teammate =
    snap.room?.players.find((p) => p.id !== snap.me?.id && p.slot !== null && slot !== null && p.slot.team === slot.team)
      ?.name ?? null;

  // Not seated: either the host hasn't listed us yet, or all four seats are taken.
  if (!slot) {
    return (
      <div className="grid gap-3">
        {banner}
        <div className="instrument grid gap-2 rounded-2xl p-5">
          <ModeBadge mode="live" />
          <p className="text-lg">
            {snap.room && snap.me
              ? "All four seats are taken, so you're watching this round."
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
          footer={<p className="text-sm text-mist">Stay on this screen. The host can start the next match.</p>}
        />
      </div>
    );
  }

  // Briefing/lobby, or the first bundle hasn't landed yet.
  if (!view || !scoreboard || scoreboard.phase === "briefing") {
    return (
      <div className="grid gap-3">
        {banner}
        <SeatCard slot={slot} teammate={teammate} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {banner}
      <MatchScoreStrip scoreboard={scoreboard} team={slot.team} />
      <VersusRoleStation view={view} scoreboard={scoreboard} onAction={(a) => session.sendAction(a)} />
    </div>
  );
}
