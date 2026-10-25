"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MatchScoreboard } from "@/game/versus/contract";
import { musicStateFor } from "./cues";
import { createHostMusic, type HostMusicController } from "./music";
import { readMuted, subscribeMuted, writeMuted } from "./mute";

export type HostMusicApi = {
  muted: boolean;
  unlocked: boolean;
  toggleMute: () => void;
  unlock: () => void;
};

/**
 * Host laptop: lobby/match beds from scoreboard phase. Unlocks on first page click
 * (or SoundToggle). No SFX.
 */
export function useHostMusic(scoreboard: MatchScoreboard | null | undefined): HostMusicApi {
  const ctrl = useRef<HostMusicController | null>(null);
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const c = createHostMusic();
    ctrl.current = c;
    c.setMuted(readMuted());

    const onPointer = () => {
      c.unlock();
      setUnlocked(c.isUnlocked());
    };
    window.addEventListener("pointerdown", onPointer, { once: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      c.dispose();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.setMuted(muted);
  }, [muted]);

  const musicState = musicStateFor(scoreboard);
  useEffect(() => {
    ctrl.current?.setState(musicState);
  }, [musicState]);

  return {
    muted,
    unlocked,
    unlock: () => {
      ctrl.current?.unlock();
      setUnlocked(!!ctrl.current?.isUnlocked());
    },
    toggleMute: () => {
      const c = ctrl.current;
      if (!c) return;
      c.unlock();
      writeMuted(!readMuted());
      setUnlocked(c.isUnlocked());
    },
  };
}
