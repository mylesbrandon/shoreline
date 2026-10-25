"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MatchEvent, MatchScoreboard, PlayerTeamAssignment } from "@/game/versus/contract";
import { createSfxCueTracker, sfxCuesFor } from "./cues";
import { readMuted, subscribeMuted, writeMuted } from "./mute";
import { getSharedPhoneSfx } from "./sfx";

export type PhoneSfxApi = {
  muted: boolean;
  unlocked: boolean;
  toggleMute: () => void;
  /** Call from the "Join the showdown" tap (user gesture). */
  unlock: () => void;
};

/**
 * Phone SFX only. Filters recentEvents + scoreboard deltas through pure cues, then plays.
 * Uses the shared controller so Join can unlock before this hook mounts.
 */
export function usePhoneSfx(opts: {
  recentEvents: readonly MatchEvent[];
  scoreboard: MatchScoreboard | null;
  slot: PlayerTeamAssignment | null;
  enabled?: boolean;
}): PhoneSfxApi {
  const { recentEvents, scoreboard, slot, enabled = true } = opts;
  const tracker = useRef(createSfxCueTracker());
  const prevBoard = useRef<MatchScoreboard | null>(null);
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  // Join may have unlocked the shared graph before this hook mounted.
  const [unlocked, setUnlocked] = useState(() =>
    typeof window === "undefined" ? false : getSharedPhoneSfx().isUnlocked(),
  );

  useEffect(() => {
    getSharedPhoneSfx().setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (!enabled) return;
    const c = getSharedPhoneSfx();
    if (!c.isUnlocked()) {
      prevBoard.current = scoreboard;
      return;
    }
    const cues = sfxCuesFor(recentEvents, prevBoard.current, scoreboard, slot, tracker.current);
    prevBoard.current = scoreboard;
    for (const cue of cues) c.play(cue);
  }, [recentEvents, scoreboard, slot, enabled]);

  return {
    muted,
    unlocked,
    unlock: () => {
      const c = getSharedPhoneSfx();
      c.unlock();
      setUnlocked(c.isUnlocked());
    },
    toggleMute: () => {
      const c = getSharedPhoneSfx();
      c.unlock();
      writeMuted(!readMuted());
      setUnlocked(c.isUnlocked());
    },
  };
}
