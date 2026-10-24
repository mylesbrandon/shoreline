"use client";
import type { SpectatorView } from "@/game/types";
import { MissionClock } from "@/components/shared/MissionClock";
import { OceanCanvas } from "./OceanCanvas";

export function SpectatorDisplay({ view }: { view: SpectatorView }) {
  const hull = Math.max(0, Math.min(100, view.boat.hull));
  const ended = view.mission.phase === "victory" || view.mission.phase === "failure";
  const victory = view.mission.phase === "victory";
  return <section className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-11rem))] overflow-hidden rounded-2xl">
    <OceanCanvas gameId={view.gameId} boat={view.boat} hazards={view.hazards} markers={view.markers}
      target={view.target} current={view.weather.current} stormIntensity={view.weather.stormIntensity} className="instrument" />
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-abyss/95 to-transparent p-4 pb-10">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.3em] text-teal">Stormline / rescue operations</p>
        <p className="mt-2 inline-block rounded border border-hull bg-abyss/80 px-2 py-1 font-mono text-xs uppercase tracking-widest">{view.mission.phase}</p></div>
      <div className="rounded-xl border border-hull bg-abyss/85 px-3 py-2 text-right">
        <p className="font-mono text-[9px] uppercase tracking-widest text-mist">Time remaining</p>
        <MissionClock mission={view.mission} className="text-4xl font-semibold sm:text-5xl" />
      </div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-abyss/95 to-transparent p-4 pt-10">
      <div className="mb-2 flex justify-between font-mono text-xs uppercase tracking-widest"><span>Rescue vessel / hull</span><span className={hull <= 25 ? "text-hazard" : "text-teal"}>{Math.round(hull)}%</span></div>
      <div role="progressbar" aria-label="Hull integrity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hull} className="h-2 overflow-hidden rounded-full bg-hull">
        <div className="h-full transition-[width]" style={{ width: hull + "%", backgroundColor: hull <= 25 ? "#ef4444" : "#2dd4bf" }} />
      </div>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-mist">Four stations · one crew · bring them home</p>
    </div>
    {ended && <div role="status" className="absolute inset-0 grid place-content-center bg-abyss/90 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Mission complete</p>
      <h2 className={`mt-3 text-4xl font-bold ${victory ? "text-teal" : "text-hazard"}`}>{victory ? "Rescue successful" : "Mission lost"}</h2>
      <p className="mt-3 text-mist">{victory ? "The crew is coming home." : view.mission.failureReason === "timeout" ? "The rescue window has closed." : "The rescue vessel could not continue."}</p>
      {view.mission.score && <p className="mt-5 font-mono text-3xl text-foam">Score {view.mission.score.total.toLocaleString()}</p>}
      <p className="mt-4 font-mono text-xs text-mist">Waiting for the host to start a new mission</p>
    </div>}
  </section>;
}
