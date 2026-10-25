"use client";
import { useEffect, useRef, useState } from "react";
import type { SpectatorMatchView, RescueEvent, TeamId } from "@/game/versus/contract";
import { newLeader, rescueKey, unseenRescues } from "./feedback";

interface Feedback {
  matchId: string;
  bursts: { key: string; rescue: RescueEvent }[];
  lead: { team: TeamId; serial: number } | null;
}

/** Arrival effects only: no prediction, score calculation or hidden target information. */
export function useRescueFeed(view: SpectatorMatchView): Feedback {
  const seen = useRef(new Set<string>());
  const previous = useRef<{ id: string; elapsed: number; leader: TeamId | null; phase: string } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const serial = useRef(0);
  const [feedback, setFeedback] = useState<Feedback>({ matchId: view.matchId, bursts: [], lead: null });
  useEffect(() => {
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
      timers.current.add(timer);
    };
    const before = previous.current;
    // Preview jump-back and real new match both begin a fresh event stream.
    const reset = !before || before.id !== view.matchId || view.scoreboard.elapsedMs < before.elapsed;
    if (reset) {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
      seen.current.clear();
    }
    const fresh = unseenRescues(view.matchId, view.recentRescues, seen.current);
    fresh.forEach((rescue) => seen.current.add(rescueKey(view.matchId, rescue)));
    const live = fresh.filter((r) => view.scoreboard.phase === "active" && view.scoreboard.elapsedMs - r.atMs >= 0 && view.scoreboard.elapsedMs - r.atMs < 2000);
    const leader = reset ? null : newLeader(before.leader, view.scoreboard);
    const lead = leader ? { team: leader, serial: ++serial.current } : null;
    previous.current = { id: view.matchId, elapsed: view.scoreboard.elapsedMs, leader: view.scoreboard.leader, phase: view.scoreboard.phase };
    if (reset || live.length || lead || (view.scoreboard.phase !== "active" && before?.phase !== view.scoreboard.phase)) {
      schedule(() => setFeedback((old) => ({
        matchId: view.matchId,
        bursts: view.scoreboard.phase === "active" ? [...(reset ? [] : old.bursts), ...live.map((rescue) => ({ key: rescueKey(view.matchId, rescue), rescue }))] : [],
        lead: view.scoreboard.phase === "active" ? lead ?? (reset ? null : old.lead) : null,
      })), 0);
    }
    for (const rescue of live) {
      const key = rescueKey(view.matchId, rescue);
      schedule(() => setFeedback((old) => ({ ...old, bursts: old.bursts.filter((b) => b.key !== key) })), 1800);
    }
    if (lead) schedule(() => setFeedback((old) => old.lead?.serial === lead.serial ? { ...old, lead: null } : old), 2000);
  }, [view.matchId, view.recentRescues, view.scoreboard]);
  useEffect(() => {
    const active = timers.current;
    const ids = seen.current;
    return () => { for (const timer of active) clearTimeout(timer); active.clear(); previous.current = null; ids.clear(); };
  }, []);
  return feedback.matchId === view.matchId ? feedback : { matchId: view.matchId, bursts: [], lead: null };
}

