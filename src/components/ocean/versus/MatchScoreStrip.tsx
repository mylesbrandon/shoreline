"use client";
import { useEffect, useRef, useState } from "react";
import type { MatchScoreboard, TeamId } from "@/game/versus/contract";
import { TEAMS } from "@/game/versus/contract";
import { formatClock } from "@/components/shared/MissionClock";
import { TEAM_INFO } from "@/components/shared/teams";
import { isFinalCountdown } from "./feedback";
import { MatchCountdown } from "./MatchCountdown";

export interface MatchScoreStripProps { scoreboard: MatchScoreboard; team?: TeamId }

export function MatchScoreStrip({ scoreboard, team }: MatchScoreStripProps) {
  const previous = useRef<{ matchId: string; rescues: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const rescues = team ? scoreboard.scores[team].rescues : 0;
  useEffect(() => {
    const old = previous.current;
    previous.current = { matchId: scoreboard.matchId, rescues };
    if (!team || !old || old.matchId !== scoreboard.matchId || rescues <= old.rescues || scoreboard.phase !== "active") {
      const reset = setTimeout(() => setFlash(false), 0);
      return () => clearTimeout(reset);
    }
    navigator.vibrate?.(80);
    const start = setTimeout(() => setFlash(true), 0);
    const end = setTimeout(() => setFlash(false), 650);
    return () => { clearTimeout(start); clearTimeout(end); };
  }, [rescues, team, scoreboard.matchId, scoreboard.phase]);
  const urgent = isFinalCountdown(scoreboard);
  const time = formatClock(scoreboard.phase === "countdown" ? scoreboard.countdownRemainingMs : Math.max(0, scoreboard.durationMs - scoreboard.elapsedMs));
  return <>
    <div key={scoreboard.matchId + ":" + rescues} className={`vs-score-strip ${flash ? "vs-strip-flash" : ""}`} aria-label="Live match scoreboard">
      {TEAMS.map((id, index) => <div key={id} className={`vs-strip-team ${scoreboard.leader === id ? "vs-strip-leading" : ""}`}
        style={{ color: TEAM_INFO[id].hex, order: index * 2 }}>
        <span>{id === "blue" ? "Blue" : "Red"}{team === id && <small className="vs-you">you</small>}</span>
        <strong key={scoreboard.matchId + scoreboard.scores[id].rescues} className="vs-score-pop">{scoreboard.scores[id].rescues}</strong>
      </div>)}
      <span className={`vs-strip-clock ${urgent ? "vs-urgent-clock" : ""}`} style={{ order: 1 }} aria-label={"Time remaining " + time}>{time}</span>
    </div>
    <MatchCountdown scoreboard={scoreboard} phone />
  </>;
}
