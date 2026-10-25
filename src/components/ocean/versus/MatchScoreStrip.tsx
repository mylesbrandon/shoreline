/**
 * Compact Blue-vs-Red score + match clock for phones and the host screen. OWNER: Developer 3.
 *
 * BASELINE PLACEHOLDER (handoff versus-1): plain numbers. TODO(dev3): the real strip (leader
 * highlight, rescue flash, countdown 3-2-1, final-10-seconds treatment).
 */
import type { MatchScoreboard, TeamId } from "@/game/versus/contract";
import { formatClock } from "@/components/shared/MissionClock";

export interface MatchScoreStripProps {
  scoreboard: MatchScoreboard;
  /** The viewer's team on a phone (marked "you"); omit on the spectator screen. */
  team?: TeamId;
}

export function MatchScoreStrip({ scoreboard, team }: MatchScoreStripProps) {
  const { scores, phase } = scoreboard;
  const clock =
    phase === "countdown"
      ? String(Math.ceil(scoreboard.countdownRemainingMs / 1000))
      : formatClock(scoreboard.durationMs - scoreboard.elapsedMs);
  return (
    <div className="instrument flex items-center justify-between rounded-xl px-4 py-2 font-mono">
      <span className="text-team-blue">
        BLUE {scores.blue.rescues}
        {team === "blue" && " (you)"}
      </span>
      <span className="tabular-nums text-foam">{clock}</span>
      <span className="text-team-red">
        {team === "red" && "(you) "}
        {scores.red.rescues} RED
      </span>
    </div>
  );
}
