/**
 * Pure audio cue mapping — no AudioContext / HTMLAudioElement.
 * Host music state + phone SFX cue names derived from MatchEvent / scoreboard deltas.
 */
import { VERSUS, type MatchEvent, type MatchScoreboard, type PlayerTeamAssignment, type TeamId } from "@/game/versus/contract";

export type MusicState = "lobby" | "countdown" | "match" | "final" | "results";

export type SfxCue =
  | "countdown_go"
  | "match_whistle"
  | "final_tick"
  | "win_jingle"
  | "lose_blip"
  | "tie_jingle"
  | "rescue_chime"
  | "rival_rescue"
  | "jelly_sting"
  | "aground_thud"
  | "wreck_crash"
  | "sonar_ping"
  | "radio_scan_0"
  | "radio_scan_1"
  | "radio_scan_2"
  | "radio_scan_3"
  | "marker_tick";

export function musicStateFor(scoreboard: MatchScoreboard | null | undefined): MusicState {
  if (!scoreboard) return "lobby";
  switch (scoreboard.phase) {
    case "briefing":
      return "lobby";
    case "countdown":
      return "countdown";
    case "ended":
      return "results";
    case "active": {
      const left = scoreboard.durationMs - scoreboard.elapsedMs;
      return left <= VERSUS.finalCountdownMs ? "final" : "match";
    }
    default:
      return "lobby";
  }
}

/** Mutable tracker so event identity + scoreboard deltas never double-fire. */
export interface SfxCueTracker {
  matchId: string | null;
  playedEvents: WeakSet<object>;
  lastRescues: Record<TeamId, number>;
  lastWipeouts: Record<TeamId, number>;
  /** Whole seconds remaining when we last emitted final_tick (null = none yet this match). */
  lastFinalSecond: number | null;
  playedCountdown: boolean;
  playedStarted: boolean;
  playedEnded: boolean;
}

export function createSfxCueTracker(): SfxCueTracker {
  return {
    matchId: null,
    playedEvents: new WeakSet(),
    lastRescues: { blue: 0, red: 0 },
    lastWipeouts: { blue: 0, red: 0 },
    lastFinalSecond: null,
    playedCountdown: false,
    playedStarted: false,
    playedEnded: false,
  };
}

function resetTracker(t: SfxCueTracker, matchId: string): void {
  t.matchId = matchId;
  t.playedEvents = new WeakSet();
  t.lastRescues = { blue: 0, red: 0 };
  t.lastWipeouts = { blue: 0, red: 0 };
  t.lastFinalSecond = null;
  t.playedCountdown = false;
  t.playedStarted = false;
  t.playedEnded = false;
}

function radioLevel(strength: number): 0 | 1 | 2 | 3 {
  if (strength >= 1) return 3;
  if (strength >= 0.67) return 2;
  if (strength >= 0.33) return 1;
  return 0;
}

/**
 * Map newly observed match events + scoreboard deltas to phone SFX cues.
 * `slot` null → spectator: shared match moments only (countdown / start / final / end).
 * Dedupes by event object identity and by scoreboard counters / phase flags.
 */
export function sfxCuesFor(
  newEvents: readonly MatchEvent[],
  scoreboardBefore: MatchScoreboard | null,
  scoreboardAfter: MatchScoreboard | null,
  slot: PlayerTeamAssignment | null,
  tracker: SfxCueTracker,
): SfxCue[] {
  const cues: SfxCue[] = [];
  const myTeam = slot?.team ?? null;

  const afterId = scoreboardAfter?.matchId ?? null;
  if (afterId && tracker.matchId !== afterId) {
    resetTracker(tracker, afterId);
    if (scoreboardAfter) {
      tracker.lastRescues = {
        blue: scoreboardAfter.scores.blue.rescues,
        red: scoreboardAfter.scores.red.rescues,
      };
      tracker.lastWipeouts = {
        blue: scoreboardAfter.scores.blue.wipeouts,
        red: scoreboardAfter.scores.red.wipeouts,
      };
    }
  }

  // Fresh events only (object identity).
  const fresh: MatchEvent[] = [];
  for (const ev of newEvents) {
    if (tracker.playedEvents.has(ev)) continue;
    tracker.playedEvents.add(ev);
    fresh.push(ev);
  }

  // If this batch wrecks our boat, suppress jelly sting — crash only (hull → 0).
  const wreckedTeams = new Set<TeamId>();
  for (const ev of fresh) {
    if (ev.type === "BOAT_WIPEOUT" && ev.cause === "wrecked") wreckedTeams.add(ev.team);
  }

  let rescueCueThisBatch = false;
  let wipeoutCueThisBatch = false;
  let countdownCue = false;
  let startedCue = false;
  let endedCue = false;

  for (const ev of fresh) {
    switch (ev.type) {
      case "MATCH_COUNTDOWN":
        if (!tracker.playedCountdown) {
          tracker.playedCountdown = true;
          countdownCue = true;
          cues.push("countdown_go");
        }
        break;
      case "MATCH_STARTED":
        if (!tracker.playedStarted) {
          tracker.playedStarted = true;
          startedCue = true;
          cues.push("match_whistle");
        }
        break;
      case "MATCH_ENDED":
        if (!tracker.playedEnded) {
          tracker.playedEnded = true;
          endedCue = true;
          if (myTeam === null) break;
          const winner = ev.result.winner;
          if (winner === null) cues.push("tie_jingle");
          else if (winner === myTeam) cues.push("win_jingle");
          else cues.push("lose_blip");
        }
        break;
      case "SURVIVOR_RESCUED": {
        if (myTeam === null) break;
        rescueCueThisBatch = true;
        cues.push(ev.rescue.team === myTeam ? "rescue_chime" : "rival_rescue");
        tracker.lastRescues[ev.rescue.team] = Math.max(
          tracker.lastRescues[ev.rescue.team],
          // Prefer scoreboard after when available; else bump by one from before.
          scoreboardAfter?.scores[ev.rescue.team].rescues ??
            (scoreboardBefore?.scores[ev.rescue.team].rescues ?? 0) + 1,
        );
        break;
      }
      case "BOAT_WIPEOUT": {
        if (myTeam === null || ev.team !== myTeam) break;
        wipeoutCueThisBatch = true;
        cues.push(ev.cause === "wrecked" ? "wreck_crash" : "aground_thud");
        tracker.lastWipeouts[ev.team] = Math.max(
          tracker.lastWipeouts[ev.team],
          scoreboardAfter?.scores[ev.team].wipeouts ??
            (scoreboardBefore?.scores[ev.team].wipeouts ?? 0) + 1,
        );
        break;
      }
      case "TEAM_GAME_EVENT": {
        if (myTeam === null || ev.team !== myTeam) break;
        const ge = ev.event;
        switch (ge.type) {
          case "HAZARD_HIT":
            // damage 0 = land (aground handled by wipeout). damage > 0 = jelly —
            // but if this hit wrecked the boat, play crash only.
            if (ge.damage > 0 && !wreckedTeams.has(ev.team)) cues.push("jelly_sting");
            break;
          case "SONAR_PINGED":
            cues.push("sonar_ping");
            break;
          case "RADIO_SCANNED":
            cues.push(`radio_scan_${radioLevel(ge.strength)}` as SfxCue);
            break;
          case "MARKER_PLACED":
            cues.push("marker_tick");
            break;
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  }

  // Scoreboard-derived fallbacks when events were dropped on the wire.
  if (scoreboardAfter) {
    const before = scoreboardBefore;

    // Phase fallbacks only when we observed a transition (need a prior board). Joining
    // mid-match with before === null must stay silent for start/end.
    if (
      before &&
      !countdownCue &&
      !tracker.playedCountdown &&
      scoreboardAfter.phase === "countdown" &&
      before.phase !== "countdown"
    ) {
      tracker.playedCountdown = true;
      cues.push("countdown_go");
    }

    if (
      before &&
      !startedCue &&
      !tracker.playedStarted &&
      scoreboardAfter.phase === "active" &&
      before.phase !== "active"
    ) {
      tracker.playedStarted = true;
      cues.push("match_whistle");
    }

    if (
      before &&
      !endedCue &&
      !tracker.playedEnded &&
      scoreboardAfter.phase === "ended" &&
      scoreboardAfter.result &&
      before.phase !== "ended"
    ) {
      tracker.playedEnded = true;
      if (myTeam !== null) {
        const winner = scoreboardAfter.result.winner;
        if (winner === null) cues.push("tie_jingle");
        else if (winner === myTeam) cues.push("win_jingle");
        else cues.push("lose_blip");
      }
    }

    if (myTeam !== null && !rescueCueThisBatch) {
      for (const team of ["blue", "red"] as const) {
        const next = scoreboardAfter.scores[team].rescues;
        const prev = tracker.lastRescues[team];
        if (next > prev) {
          cues.push(team === myTeam ? "rescue_chime" : "rival_rescue");
          tracker.lastRescues[team] = next;
        }
      }
    } else if (scoreboardAfter) {
      tracker.lastRescues = {
        blue: scoreboardAfter.scores.blue.rescues,
        red: scoreboardAfter.scores.red.rescues,
      };
    }

    if (myTeam !== null && !wipeoutCueThisBatch) {
      const next = scoreboardAfter.scores[myTeam].wipeouts;
      const prev = tracker.lastWipeouts[myTeam];
      if (next > prev) {
        // Cause unknown without the event — prefer crash when hull is freshly full after respawn
        // (engine repairs on wipeout). Aground vs wrecked both bump wipeouts; default to crash
        // only when we also saw jelly in the same scoreboard step is unavailable, so use wreck
        // as the safer "hull hit zero" beach hit. Aground thud if hull was already full and we
        // can't tell — scoreboard doesn't carry cause. Use wreck_crash when hull is 100 after
        // wipeout (always true post-respawn). Without cause, emit wreck_crash once as the loud cue.
        // Prefer aground_thud only when an event said so; scoreboard fallback → wreck_crash.
        cues.push("wreck_crash");
        tracker.lastWipeouts[myTeam] = next;
      }
    } else if (scoreboardAfter) {
      tracker.lastWipeouts = {
        blue: scoreboardAfter.scores.blue.wipeouts,
        red: scoreboardAfter.scores.red.wipeouts,
      };
    }

    // Final 10 s: one soft tick per whole second remaining.
    if (scoreboardAfter.phase === "active") {
      const left = scoreboardAfter.durationMs - scoreboardAfter.elapsedMs;
      if (left <= VERSUS.finalCountdownMs && left > 0) {
        const second = Math.ceil(left / 1000);
        if (tracker.lastFinalSecond !== second) {
          tracker.lastFinalSecond = second;
          cues.push("final_tick");
        }
      }
    }
  }

  return cues;
}
