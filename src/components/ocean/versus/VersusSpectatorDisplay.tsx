"use client";
/**
 * Host laptop / big screen for a 2v2 match: both oceans side by side + the scoreboard.
 * OWNER: Developer 3. Props in only (SpectatorMatchView); no actions.
 *
 * BASELINE PLACEHOLDER (handoff versus-1): two plain OceanCanvas maps and the score strip.
 * TODO(dev3): the real split-screen spectator experience.
 */
import { TEAMS } from "@/game/versus/contract";
import type { SpectatorMatchView } from "@/game/versus/contract";
import { OceanCanvas } from "../OceanCanvas";
import { MatchScoreStrip } from "./MatchScoreStrip";
import { VersusResults } from "./VersusResults";

export interface VersusSpectatorDisplayProps {
  view: SpectatorMatchView;
}

export function VersusSpectatorDisplay({ view }: VersusSpectatorDisplayProps) {
  const { result } = view.scoreboard;
  return (
    <section className="grid gap-3">
      <MatchScoreStrip scoreboard={view.scoreboard} />
      <div className="grid gap-3 sm:grid-cols-2">
        {TEAMS.map((team) => {
          const world = view.teams[team];
          return (
            <div key={team} className="grid gap-1">
              <p className={`font-mono text-xs uppercase tracking-[0.3em] ${team === "blue" ? "text-team-blue" : "text-team-red"}`}>
                {team} · hull {Math.round(world.boat.hull)}%
              </p>
              <OceanCanvas
                gameId={`${world.gameId}-${team}`}
                boat={world.boat}
                hazards={world.hazards}
                markers={world.markers}
                target={world.target}
                current={world.weather.current}
                stormIntensity={world.weather.stormIntensity}
                className="instrument"
              />
            </div>
          );
        })}
      </div>
      {result && <VersusResults result={result} />}
    </section>
  );
}
