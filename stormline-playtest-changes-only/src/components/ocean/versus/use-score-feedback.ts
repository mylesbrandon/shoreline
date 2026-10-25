"use client";
import { useEffect, useRef, useState } from "react";
import type { MatchScoreboard, TeamId } from "@/game/versus/contract";
import { scoreNotices, type ScoreNotice } from "./score-feedback";

export function useScoreFeedback(scoreboard?: MatchScoreboard): Partial<Record<TeamId, ScoreNotice>> {
  const previous = useRef<MatchScoreboard | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [notices, setNotices] = useState<{ matchId: string; teams: Partial<Record<TeamId, ScoreNotice>> }>({ matchId: "", teams: {} });
  useEffect(() => {
    const old = previous.current;
    previous.current = scoreboard ?? null;
    const reset = !scoreboard || !old || old.matchId !== scoreboard.matchId || scoreboard.elapsedMs < old.elapsedMs || scoreboard.phase === "briefing" || scoreboard.phase === "countdown";
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
      timers.current.add(timer);
    };
    if (reset) {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
      if (old && (!scoreboard || old.matchId !== scoreboard.matchId || old.phase !== scoreboard.phase || scoreboard.elapsedMs < old.elapsedMs)) {
        schedule(() => setNotices({ matchId: scoreboard?.matchId ?? "", teams: {} }), 0);
      }
      return;
    }
    const fresh = scoreNotices(old, scoreboard);
    if (!fresh.length) return;
    schedule(() => setNotices((current) => {
      const teams = current.matchId === scoreboard.matchId ? { ...current.teams } : {};
      for (const notice of fresh) teams[notice.team] = notice;
      return { matchId: scoreboard.matchId, teams };
    }), 0);
    for (const notice of fresh) schedule(() => setNotices((current) => {
      if (current.teams[notice.team]?.key !== notice.key) return current;
      return { ...current, teams: { ...current.teams, [notice.team]: undefined } };
    }), 2200);
  }, [scoreboard]);
  useEffect(() => {
    const active = timers.current;
    return () => { for (const timer of active) clearTimeout(timer); active.clear(); previous.current = null; };
  }, []);
  return notices.matchId === scoreboard?.matchId ? notices.teams : {};
}
