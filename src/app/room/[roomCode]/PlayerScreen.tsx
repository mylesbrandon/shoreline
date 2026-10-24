"use client";
/**
 * Player phone screen: name entry → lobby → role station → results. OWNER: Developer 2.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PlayerSession } from "@/lib/game-client/player-session";
import { useStore } from "@/lib/game-client/hooks";
import { createTransport } from "@/lib/realtime/create-transport";
import { resolveTransportKind } from "@/lib/realtime/env";
import { saveIdentity } from "@/lib/realtime/player-identity";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { isMissionOver, MissionResults } from "@/components/shared/MissionResults";
import { MissionClock } from "@/components/shared/MissionClock";
import { RoleStation } from "@/components/shared/RoleStation";
import { ROLE_INFO } from "@/components/shared/roles";

export function PlayerScreen({ roomCode, initialName }: { roomCode: string; initialName: string }) {
  const isMock = resolveTransportKind() === "mock";
  const [name, setName] = useState(initialName);
  const [session, setSession] = useState<PlayerSession | null>(null);

  const join = () => {
    const identity = saveIdentity(roomCode, name.trim() || "Sailor");
    setSession(new PlayerSession({ transport: createTransport(roomCode), identity }));
  };

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
      ) : session ? (
        <JoinedView session={session} />
      ) : (
        <form
          className="instrument grid gap-3 rounded-2xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
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
          <p className="text-lg">{snap.room ? "All four stations are crewed — you're watching." : `Contacting host… (${snap.status})`}</p>
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
