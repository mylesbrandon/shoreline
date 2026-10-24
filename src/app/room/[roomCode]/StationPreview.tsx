"use client";
/**
 * MOCK station sandbox: /room/DEMO?preview=captain|sonar|weather|radio|spectator
 * Renders a station from scripted mock views and logs emitted actions on screen.
 * Nothing here touches the network or the engine. OWNER: Developer 2 (route); used by Devs 3 & 4.
 */
import Link from "next/link";
import { Wordmark } from "@/components/shared/Wordmark";
import { useState } from "react";
import { ROLES, type PlayerAction, type Role } from "@/game/types";
import { mockRoleViewsAt, mockSpectatorViewAt } from "@/game/mock-state";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { MissionClock } from "@/components/shared/MissionClock";
import { RoleStation } from "@/components/shared/RoleStation";
import { ROLE_INFO } from "@/components/shared/roles";
import { useAnimationTime } from "@/components/shared/use-animation-time";
import { SpectatorDisplay } from "@/components/ocean/SpectatorDisplay";

export function StationPreview({ target }: { target: Role | "spectator" }) {
  const [animate, setAnimate] = useState(true);
  const t = useAnimationTime(animate);
  const [log, setLog] = useState<PlayerAction[]>([]);
  const onAction = (a: PlayerAction) => setLog((prev) => [a, ...prev].slice(0, 8));

  const views = mockRoleViewsAt(t);

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-start gap-3 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-xl font-bold">
          <Wordmark />
        </Link>
        <ModeBadge mode="preview" />
      </header>

      <nav className="flex flex-wrap gap-1.5">
        {[...ROLES, "spectator" as const].map((r) => (
          <Link
            key={r}
            href={`/room/DEMO?preview=${r}`}
            className={`rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider ${
              r === target ? "border-teal text-teal" : "border-hull text-mist"
            }`}
          >
            {r === "spectator" ? "Spectator" : ROLE_INFO[r].label}
          </Link>
        ))}
      </nav>

      {target === "spectator" ? (
        <SpectatorDisplay view={mockSpectatorViewAt(t)} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-semibold ${ROLE_INFO[target].accent}`}>{ROLE_INFO[target].label}</h1>
            <MissionClock mission={views[target].mission} className="text-xl" />
          </div>
          <RoleStation view={views[target]} onAction={onAction} />
        </>
      )}

      <label className="flex items-center gap-2 font-mono text-xs text-mist">
        <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
        Animate scripted boat
      </label>

      {target !== "spectator" && (
        <section className="instrument rounded-xl p-3">
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.25em] text-mist">Emitted actions (not sent anywhere)</h2>
          {log.length === 0 ? (
            <p className="font-mono text-xs text-hull">Interact with the station…</p>
          ) : (
            <ul className="grid gap-0.5 font-mono text-xs text-cyan">
              {log.map((a, i) => (
                <li key={i}>{JSON.stringify(a)}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
