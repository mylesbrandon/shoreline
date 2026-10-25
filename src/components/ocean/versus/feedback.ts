import { VERSUS, type MatchScoreboard, type RescueEvent, type TeamId } from "@/game/versus/contract";

export function countdownLabel(scoreboard: MatchScoreboard): string | null {
  if (scoreboard.phase === "countdown") return String(Math.max(1, Math.ceil(scoreboard.countdownRemainingMs / 1000)));
  if (scoreboard.phase === "active" && scoreboard.elapsedMs < 1000) return "GO!";
  return null;
}

export function isFinalCountdown(scoreboard: MatchScoreboard): boolean {
  return scoreboard.phase === "active" && scoreboard.durationMs - scoreboard.elapsedMs <= VERSUS.finalCountdownMs;
}

export function rescueKey(matchId: string, event: RescueEvent): string {
  return `${matchId}:${event.team}:${event.survivorIndex}`;
}

/** Pure dedupe: preserve event order without mutating the caller's set or snapshots. */
export function unseenRescues(matchId: string, events: readonly RescueEvent[], seen: ReadonlySet<string>): RescueEvent[] {
  const keys = new Set(seen);
  return events.filter((event) => {
    const key = rescueKey(matchId, event);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export function newLeader(previous: TeamId | null, scoreboard: MatchScoreboard): TeamId | null {
  return scoreboard.phase === "active" && scoreboard.leader !== null && scoreboard.leader !== previous ? scoreboard.leader : null;
}
