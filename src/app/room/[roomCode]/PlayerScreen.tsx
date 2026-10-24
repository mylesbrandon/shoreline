"use client";
/**
 * Player phone screen: name entry → lobby → role station → results. OWNER: Developer 2.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayerSession } from "@/lib/game-client/player-session";
import { useStore } from "@/lib/game-client/hooks";
import { createTransport } from "@/lib/realtime/create-transport";
import { resolveTransportKind } from "@/lib/realtime/env";
import { loadTabIdentity, saveIdentity, type StoredIdentity } from "@/lib/realtime/player-identity";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { isMissionOver, MissionResults } from "@/components/shared/MissionResults";
import { MissionClock } from "@/components/shared/MissionClock";
import { RoleStation } from "@/components/shared/RoleStation";
import { ROLE_INFO } from "@/components/shared/roles";

/**
 * "checking" lasts until the mount effect has looked for this tab's stored identity — storage can
 * only be read after mount, so the answer can't be known during the first render. One state value
 * (not three) keeps that a single transition.
 */
type Boarding =
  | { phase: "checking" }
  | { phase: "form"; name: string }
  | { phase: "joined"; session: PlayerSession };

export function PlayerScreen({ roomCode, initialName }: { roomCode: string; initialName: string }) {
  const isMock = resolveTransportKind() === "mock";
  const [boarding, setBoarding] = useState<Boarding>(
    isMock ? { phase: "form", name: initialName } : { phase: "checking" },
  );
  const restored = useRef(false);

  const join = (identity: StoredIdentity) =>
    setBoarding({ phase: "joined", session: new PlayerSession({ transport: createTransport(roomCode), identity }) });

  // Reloading mid-game must come back as the SAME player, so the host hands back the same role
  // (hello → room + views). Only this tab's own id counts: a fresh tab still gets the name form,
  // so several tabs in one browser stay separate players.
  useEffect(() => {
    if (isMock || restored.current) return;
    restored.current = true;
    const mine = loadTabIdentity(roomCode);
    setBoarding(
      mine
        ? // saveIdentity re-claims this tab's lease on the id.
          { phase: "joined", session: new PlayerSession({ transport: createTransport(roomCode), identity: saveIdentity(roomCode, mine.name) }) }
        : { phase: "form", name: initialName },
    );
  }, [isMock, roomCode, initialName]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-start gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Storm<span className="text-teal">line</span>
        </Link>
        <span className="font-mono text-sm tracking-[0.3em] text-mist">{roomCode}</span>
      </header>

      {isMock ? (
        <MockNotice />
      ) : boarding.phase === "joined" ? (
        <JoinedView session={boarding.session} />
      ) : boarding.phase === "checking" ? (
        <p className="instrument rounded-2xl p-5 text-mist">Reconnecting…</p>
      ) : (
        <form
          className="instrument grid gap-3 rounded-2xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            join(saveIdentity(roomCode, boarding.name.trim() || "Sailor"));
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
            Board the vessel
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
        synchronized. Configure <code>.env.local</code> (see docs/DEPLOY.md), or try a station with mock data:
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["captain", "sonar", "weather", "radio"] as const).map((r) => (
          <Link key={r} href={`/room/DEMO?preview=${r}`} className="instrument rounded-xl p-3 text-center">
            {ROLE_INFO[r].label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function JoinedView({ session }: { session: PlayerSession }) {
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
  const role = snap.me?.role ?? null;
  const status = snap.room?.status ?? "lobby";

  if (!role) {
    return (
      <div className="grid gap-3">
        {banner}
        <div className="instrument grid gap-2 rounded-2xl p-5">
          <ModeBadge mode="live" />
          <p className="text-lg">
            {snap.room && snap.me
              ? "All four stations are crewed — you're watching."
              : `Contacting host… (${snap.status})`}
          </p>
        </div>
      </div>
    );
  }

  const info = ROLE_INFO[role];
  const Icon = info.icon;

  if (status === "lobby" || !snap.view) {
    return (
      <div className="grid gap-3">
        {banner}
        <div className="instrument grid justify-items-center gap-3 rounded-2xl p-8 text-center">
          <Icon className={`size-14 ${info.accent}`} />
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Your station</p>
          <h1 className={`text-4xl font-bold ${info.accent}`}>{info.label}</h1>
          <p className="text-mist">{info.brief}</p>
          <p className="font-mono text-xs text-hull">Waiting for the host to start…</p>
        </div>
      </div>
    );
  }

  if (isMissionOver(snap.view.mission)) {
    return (
      <div className="grid gap-3">
        {banner}
        <MissionResults
          mission={snap.view.mission}
          footer={<p className="font-mono text-xs text-mist">Stay on this screen — the host can start the next mission.</p>}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {banner}
      <div className="flex items-center justify-between">
        <h1 className={`flex items-center gap-2 text-2xl font-semibold ${info.accent}`}>
          <Icon className="size-6" /> {info.label}
        </h1>
        <MissionClock mission={snap.view.mission} className="text-xl" />
      </div>
      <RoleStation view={snap.view} onAction={(a) => session.sendAction(a)} />
    </div>
  );
}
