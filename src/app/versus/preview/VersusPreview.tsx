"use client";
/**
 * MOCK 2v2 sandbox. Renders versus stations and the spectator screen from the scripted fixtures
 * in src/game/versus/mock.ts and logs emitted actions on screen. No network, no engine.
 * OWNER: Developer 2 (route); used by Developers 3 & 4.
 */
import Link from "next/link";
import { useState } from "react";
import type { PlayerAction } from "@/game/types";
import { TEAMS, type TeamId } from "@/game/versus/contract";
import { MOCK_MOMENTS, MOCK_RESULT_RED_WINS, mockScoreboardAt, mockSpectatorMatchViewAt, mockVersusViewsAt } from "@/game/versus/mock";
import { ModeBadge } from "@/components/shared/ModeBadge";
import { Wordmark } from "@/components/shared/Wordmark";
import { TEAM_INFO, VERSUS_ROLE_INFO } from "@/components/shared/teams";
import { useAnimationTime } from "@/components/shared/use-animation-time";
import { VersusRoleStation } from "@/components/shared/VersusRoleStation";
import { MatchScoreStrip } from "@/components/ocean/versus/MatchScoreStrip";
import { VersusResults } from "@/components/ocean/versus/VersusResults";
import { VersusSpectatorDisplay } from "@/components/ocean/versus/VersusSpectatorDisplay";

export type VersusPreviewTarget = "captain" | "navigator" | "spectator" | "results";

const JUMPS: [label: string, atMs: number][] = [
  ["Countdown", MOCK_MOMENTS.countdown],
  ["Start", MOCK_MOMENTS.start],
  ["Final 10 s", MOCK_MOMENTS.finalCountdown],
  ["Results", MOCK_MOMENTS.results],
];

export function VersusPreview({ target, team }: { target: VersusPreviewTarget; team: TeamId }) {
  const [animate, setAnimate] = useState(true);
  const [offset, setOffset] = useState<number>(MOCK_MOMENTS.start);
  const elapsed = useAnimationTime(animate);
  const t = offset + elapsed;
  const [log, setLog] = useState<PlayerAction[]>([]);
  const onAction = (a: PlayerAction) => setLog((prev) => [a, ...prev].slice(0, 8));

  const scoreboard = mockScoreboardAt(t);
  const seat = target === "captain" || target === "navigator" ? target : null;
  const wide = target === "spectator";

  return (
    <main className={`mx-auto grid min-h-dvh content-start gap-3 px-4 py-4 ${wide ? "max-w-7xl" : "max-w-xl"}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-xl font-bold">
          <Wordmark />
        </Link>
        <ModeBadge mode="preview" />
      </header>

      <nav className="flex flex-wrap gap-1.5">
        {(["captain", "navigator", "spectator", "results"] as const).map((v) => (
          <Link
            key={v}
            href={`/versus/preview?view=${v}&team=${team}`}
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              v === target ? "border-sand bg-sand text-[#12324a]" : "border-hull text-mist"
            }`}
          >
            {v === "captain" || v === "navigator" ? VERSUS_ROLE_INFO[v].label : v === "spectator" ? "Big screen" : "Results"}
          </Link>
        ))}
        {TEAMS.map((tm) => (
          <Link
            key={tm}
            href={`/versus/preview?view=${target}&team=${tm}`}
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tm === team ? `${TEAM_INFO[tm].border} ${TEAM_INFO[tm].text}` : "border-hull text-mist"
            }`}
          >
            {TEAM_INFO[tm].label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-mist">Jump to</span>
        {JUMPS.map(([label, atMs]) => (
          <button
            key={label}
            type="button"
            onClick={() => setOffset(atMs - elapsed)}
            className="rounded-md border border-hull px-3 py-1 text-sm text-mist"
          >
            {label}
          </button>
        ))}
      </div>

      {target === "spectator" && <VersusSpectatorDisplay view={mockSpectatorMatchViewAt(t)} />}
      {target === "results" && <VersusResults result={scoreboard.result ?? MOCK_RESULT_RED_WINS} team={team} />}
      {seat && (
        <>
          <MatchScoreStrip scoreboard={scoreboard} team={team} />
          <h1 className={`text-2xl font-semibold ${TEAM_INFO[team].text}`}>
            {TEAM_INFO[team].label}&apos;s {VERSUS_ROLE_INFO[seat].label}
          </h1>
          <VersusRoleStation view={mockVersusViewsAt(t)[team][seat]} onAction={onAction} />
        </>
      )}

      <label className="flex items-center gap-2 text-sm text-mist">
        <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
        Animate scripted match
      </label>

      {seat && (
        <section className="instrument rounded-xl p-3">
          <h2 className="mb-1 text-sm font-semibold text-mist">Actions this screen sent (practice: they go nowhere)</h2>
          {log.length === 0 ? (
            <p className="text-sm text-mist">Tap the controls above and each action shows up here.</p>
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
