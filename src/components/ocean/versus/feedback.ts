import { VERSUS, type MatchScoreboard, type RescueEvent, type TeamId } from "@/game/versus/contract";

/**
 * When the countdown clip says each number, in ms after the countdown starts (measured from
 * public/audio/sfx/countdown-go.mp3 at natural speed; "GO" at 3.5 s = VERSUS.countdownMs). The
 * numbers follow the voice, so nobody sees "2" while hearing "3".
 */
export const COUNTDOWN_BEATS_MS = { three: 550, two: 1_600, one: 2_500 } as const;

export function countdownLabel(scoreboard: MatchScoreboard): string | null {
  if (scoreboard.phase === "countdown") {
    const sinceStart = VERSUS.countdownMs - scoreboard.countdownRemainingMs;
    if (sinceStart >= COUNTDOWN_BEATS_MS.one) return "1";
    if (sinceStart >= COUNTDOWN_BEATS_MS.two) return "2";
    if (sinceStart >= COUNTDOWN_BEATS_MS.three) return "3";
    return "Ready";
  }
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
