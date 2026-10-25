/**
 * End-of-mission results card (victory / failure + score). OWNER: Developer 2 (shared chrome).
 * Renders whatever the engine put in MissionState.score; the formula belongs to the engine.
 */
import type { MissionState } from "@/game/types";
import { formatClock } from "./MissionClock";

const FAILURE_COPY: Record<NonNullable<MissionState["failureReason"]>, string> = {
  timeout: "Run it back.",
  hull_destroyed: "Ski beached on a sandbar.",
};

export function isMissionOver(mission: MissionState): boolean {
  return mission.phase === "victory" || mission.phase === "failure";
}

export function MissionResults({ mission, footer }: { mission: MissionState; footer?: React.ReactNode }) {
  const won = mission.phase === "victory";
  const score = mission.score;
  const rows: [string, string][] = score
    ? [
        ["Time left", formatClock(score.timeRemainingMs)],
        ["Ski health", `${Math.round(score.hullRemaining)}%`],
        ["Hazards hit", String(score.hazardsHit)],
        ["Sweeps · calls · braces", `${score.pingsUsed} · ${score.scansUsed} · ${score.shieldsUsed}`],
      ]
    : [];
  return (
    <section className="instrument grid justify-items-center gap-3 rounded-2xl p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">{won ? "Rescue complete" : "Rescue failed"}</p>
      <h2 className={`text-4xl font-bold ${won ? "text-teal" : "text-hazard"}`}>{won ? "Swimmer safe!" : "The rip took them"}</h2>
      {won && <p className="text-mist">They&apos;re back on the sand, shaken but breathing.</p>}
      {!won && mission.failureReason && <p className="text-mist">{FAILURE_COPY[mission.failureReason]}</p>}
      {score && (
        <>
          <p className="font-mono text-5xl font-semibold tabular-nums text-foam">{score.total}</p>
          <dl className="grid w-full max-w-xs gap-1 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-mist">{k}</dt>
                <dd className="font-mono tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {footer}
    </section>
  );
}
